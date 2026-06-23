# %%
import os
from collections import defaultdict

import pandas as pd
from datasets import Dataset, load_dataset
from tqdm import tqdm

# %%
tossup_ds = load_dataset("qanta-challenge/packet-questions", "tossup", split="tossup")
bonus_ds = load_dataset("qanta-challenge/packet-questions", "bonus", split="bonus")


# %%
def save_image(img, packet_dir: str, hash_key: str):
    if img is None:
        return
    img_path = f"{packet_dir}/img/{hash_key}.png"
    if os.path.exists(img_path):
        return
    img.save(img_path)


def build_img_tag(hash_key: str) -> str:
    return f'<multimodal type="img" hash="{hash_key}">'


def save_tossup_assets(example: dict, packet_dir: str) -> dict:
    """Save tossup images using their dataset-provided hash keys.

    The new schema embeds <multimodal type="img" hash="..."> tags directly in the
    `question` field, and `tokens`/`images` are aligned by appearance order.
    """
    tokens = example.get("tokens", []) or []
    img_hashes = [t["hash_key"] for t in tokens if t["type"] == "image"]
    audio_hashes = [t["hash_key"] for t in tokens if t["type"] == "audio"]
    images = example.get("images", []) or []

    for h, img in zip(img_hashes, images):
        save_image(img, packet_dir, h)

    return {
        "has_image": len(img_hashes) > 0,
        "has_audio": len(audio_hashes) > 0,
    }


def part_image_indices(splits: list, part_idx: int) -> list:
    """Indices into `part_images` for the given (0-based) part.

    `part_image_splits` are cumulative boundaries of length num_parts + 1.
    e.g. [0, 1, 3, 5] -> part1: [0], part2: [1, 2], part3: [3, 4].
    The first index of a part is the question image; the second (if present)
    is the answer image.
    """
    if not splits or part_idx + 1 >= len(splits):
        return []
    return list(range(splits[part_idx], splits[part_idx + 1]))


def save_bonus_assets(example: dict, packet_dir: str, bonus_idx: int) -> tuple:
    """Save bonus images and return (leadin_text, part_rows).

    Each part row carries the question text (with the question image tag appended),
    the answers, and the path to the answer image (or None).
    """
    leadin = example.get("leadin", "") or ""
    leadin_images = example.get("leadin_images") or []
    if leadin_images and leadin_images[0] is not None:
        h = f"b{bonus_idx}_leadin"
        save_image(leadin_images[0], packet_dir, h)
        leadin = f"{leadin} {build_img_tag(h)}".strip()

    parts = example.get("parts", []) or []
    part_images = example.get("part_images") or []
    splits = example.get("part_image_splits") or []

    part_rows = []
    for j, part in enumerate(parts):
        n = j + 1
        text = part.get("question", "") or ""
        answer_image_path = None

        indices = part_image_indices(splits, j)

        # First image of the part is the question image (shown with the part).
        if len(indices) >= 1:
            qi = indices[0]
            if qi < len(part_images) and part_images[qi] is not None:
                h = f"b{bonus_idx}_p{n}_q"
                save_image(part_images[qi], packet_dir, h)
                text = f"{text} {build_img_tag(h)}".strip()

        # Second image of the part is the answer image (revealed after answering).
        if len(indices) >= 2:
            ai = indices[1]
            if ai < len(part_images) and part_images[ai] is not None:
                h = f"b{bonus_idx}_p{n}_a"
                save_image(part_images[ai], packet_dir, h)
                answer_image_path = f"img/{h}.png"

        part_rows.append(
            {
                "text": text,
                "clean_answers": part.get("clean_answers", []),
                "answer": part.get("answer", ""),
                "answer_image": answer_image_path,
            }
        )

    return leadin, part_rows


# %%
def create_packet(
    tossup_dataset: Dataset,
    bonus_dataset: Dataset,
    packet_number: int,
    tournament_code: str = "qanta26",
):
    packet_name = f"packet_{packet_number}"
    packet_dir = f"data/{tournament_code}/{packet_name}"
    os.makedirs(packet_dir, exist_ok=True)

    for dirname in ["img", "audio"]:
        dirpath = f"{packet_dir}/{dirname}"
        if os.path.exists(dirpath):
            for file in os.listdir(dirpath):
                os.remove(os.path.join(dirpath, file))
        else:
            os.makedirs(dirpath, exist_ok=True)

    # --- Tossups ---
    tossup_dicts = []
    for e in tqdm(tossup_dataset, total=len(tossup_dataset)):
        mm_info = save_tossup_assets(e, packet_dir)
        tossup_dicts.append(
            {
                "qid": e["qid"],
                "question": e["question"],
                "answer": e["answer"],
                "clean_answers": e["clean_answers"],
                "answerline": e.get("answerline") or f"<b>{e['answer']}</b>",
            }
            | mm_info
        )
    pd.DataFrame(tossup_dicts).to_csv(f"{packet_dir}/tossups.csv", index=False)

    # --- Bonuses ---
    bonus_dicts = []
    for i, e in tqdm(enumerate(bonus_dataset, start=1), total=len(bonus_dataset)):
        leadin, part_rows = save_bonus_assets(e, packet_dir, i)
        row: dict = {
            "question_id": e["qid"],
            "leadin": leadin,
        }
        for j, part in enumerate(part_rows):
            n = j + 1
            row[f"part{n}"] = part["text"]
            row[f"answer{n}"] = str(part["clean_answers"])
            row[f"answerline{n}"] = f"<b>{part['answer']}</b>"
            row[f"answer_image{n}"] = part["answer_image"]
        bonus_dicts.append(row)
    print(f"{len(bonus_dicts)} bonuses")
    pd.DataFrame(bonus_dicts).to_csv(f"{packet_dir}/bonuses.csv", index=False)


# %%
for packet_idx in range(1, 6):
    packet_tossups = tossup_ds.filter(lambda x: f"-packet{packet_idx}-" in x["qid"])
    packet_bonuses = bonus_ds.filter(lambda x: f"-packet{packet_idx}-" in x["qid"])
    create_packet(
        packet_tossups, packet_bonuses, packet_idx, tournament_code="qanta26-playtest"
    )

# %%
packet_tossups = tossup_ds.filter(lambda x: "-packet" not in x["qid"])
packet_bonuses = bonus_ds.filter(lambda x: "-packet" not in x["qid"])
create_packet(packet_tossups, packet_bonuses, 7, tournament_code="qanta26-playtest")
# %%


tossup_packets: dict[int, list[dict]] = defaultdict(list)
for q in tqdm(tossup_ds, total=len(tossup_ds)):
    if "-packet" not in q["qid"]:
        packet_idx = 7
    else:
        packet_idx = int(q["qid"].split("-")[1][-1])
    tossup_packets[packet_idx].append(q)
# %%
bonus_packets: dict[int, list[dict]] = defaultdict(list)
for q in tqdm(bonus_ds, total=len(bonus_ds)):
    if "-packet" not in q["qid"]:
        packet_idx = 7
    else:
        packet_idx = int(q["qid"].split("-")[1][-1])
    bonus_packets[packet_idx].append(q)

# %%
for packet_idx, packets in tqdm(tossup_packets.items(), total=len(tossup_packets)):
    create_packet(
        packets,
        bonus_packets[packet_idx],
        packet_idx,
        tournament_code="qanta26-playtest",
    )
# %%
