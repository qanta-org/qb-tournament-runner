# %%
import os

import pandas as pd
import tqdm
from datasets import Dataset, load_dataset
from tqdm import tqdm

tossups = load_dataset(
    "qanta-challenge/trails-con-questions",
    "tossup",
    split="train",
)

bonuses = load_dataset(
    "qanta-challenge/trails-con-questions",
    "bonus",
    split="train",
)

TOSSUPS_TO_SKIP = {
    "Resident Evil 4",
    "Blink 182",
    "James Cameron",
    "Marge vs. The Monorail",
}


def save_image(img, packet_dir: str, hash_key: str):
    img_path = f"{packet_dir}/img/{hash_key}.png"
    if os.path.exists(img_path):
        return
    img.save(img_path)


def save_tossup_assets(example: dict, packet_dir: str) -> dict:
    tokens = example.get("tokens", [])
    img_hashes = [t["hash_key"] for t in tokens if t["type"] == "image"]
    audio_hashes = [t["hash_key"] for t in tokens if t["type"] == "audio"]
    images = example.get("images", [])

    for h, img in zip(img_hashes, images):
        save_image(img, packet_dir, h)

    return {
        "has_image": len(img_hashes) > 0,
        "has_audio": len(audio_hashes) > 0,
    }


def save_bonus_assets(example: dict, packet_dir: str) -> dict:
    has_image = False

    for t in example.get("leadin_tokens", []):
        if (
            t["type"] == "image"
            and t.get("hash_key")
            and example.get("leadin_image") is not None
        ):
            save_image(example["leadin_image"], packet_dir, t["hash_key"])
            has_image = True

    part_images = example.get("part_images", [])
    for part in example["parts"]:
        idx = part.get("image_idx")
        if idx is None or idx == -1 or part_images[idx] is None:
            continue
        for t in part["tokens"]:
            if t["type"] == "image" and t.get("hash_key"):
                save_image(part_images[idx], packet_dir, t["hash_key"])
                has_image = True

    has_audio = len(example.get("audio", [])) > 0
    return {"has_image": has_image, "has_audio": has_audio}


def create_packet(
    tossup_dataset: Dataset,
    bonus_dataset: Dataset,
    tournament_code: str = "trails-con",
):
    packet_name = "packet_1"
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
    for i, e in tqdm(enumerate(tossup_dataset, start=1), total=len(tossup_dataset)):
        if e["answer"] in TOSSUPS_TO_SKIP:
            continue
        mm_info = save_tossup_assets(e, packet_dir)
        tossup_dicts.append(
            {
                "qid": e["qid"],
                "question": e["question"],
                "answer": e["answer"],
                "clean_answers": e["clean_answers"],
                "answerline": f"<b>{e['answer']}</b>",
            }
            | mm_info
        )
    pd.DataFrame(tossup_dicts).to_csv(f"{packet_dir}/tossups.csv", index=False)

    # --- Bonuses ---
    bonus_dicts = []
    for i, e in tqdm(enumerate(bonus_dataset, start=1), total=len(bonus_dataset)):
        if i > 5 and i <= 10:
            continue
        save_bonus_assets(e, packet_dir)
        row: dict = {
            "question_id": e["qid"],
            "leadin": e["leadin"],
        }
        for j, part in enumerate(e["parts"]):
            n = j + 1
            row[f"part{n}"] = part["question"]
            row[f"answer{n}"] = str(part["clean_answers"])
            row[f"answerline{n}"] = f"<b>{part['answer']}</b>"
        bonus_dicts.append(row)
    print(len(bonus_dicts))
    pd.DataFrame(bonus_dicts).to_csv(f"{packet_dir}/bonuses.csv", index=False)


# %%
create_packet(tossups, bonuses)

# %%
