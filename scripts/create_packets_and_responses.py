# %%
import os

import pandas as pd
import tqdm
from datasets import Dataset, load_dataset
from tqdm import tqdm

dataset = load_dataset(
    "168mxie/qanta-multimodal-tossups",
    split="train",
)

for sample in dataset:
    print(sample)
    break


def create_multimodal_assets(example: dict, packet_dir: str):
    mm_tokens = example["multimodal_tokens"]
    img_hashes = [t["hash_key"] for t in mm_tokens if t["type"] == "image"]
    audio_hashes = [t["hash_key"] for t in mm_tokens if t["type"] == "audio"]
    images = example["images"]  # list of PIL images

    for h, img in zip(img_hashes, images):
        img_path = f"{packet_dir}/img/{h}.png"
        # verify that image path doesn't already exist
        if os.path.exists(img_path):
            print("WARNING: Image path already exists, skipping")
            continue
        img.save(img_path)
    return {
        "has_image": len(img_hashes) > 0,
        "has_audio": len(audio_hashes) > 0,
    }


def create_packet(dataset: Dataset, tournament_code: str = "march-5-demo"):
    packet_name = "packet_1"
    packet_dir = f"data/{tournament_code}/{packet_name}"
    os.makedirs(packet_dir, exist_ok=True)

    # clear the img/ and audio/ directories
    for dirname in ["img", "audio"]:
        dirpath = f"{packet_dir}/{dirname}"
        if os.path.exists(dirpath):
            for file in os.listdir(dirpath):
                os.remove(os.path.join(dirpath, file))
        else:
            os.makedirs(dirpath, exist_ok=True)

    tossup_dicts = []
    for i, e in tqdm(enumerate(dataset, start=1), total=len(dataset)):
        mm_info_dict = create_multimodal_assets(e, packet_dir)
        tossup_dict = {
            "qid": f"mm-march5-t-01-{i:02d}",
            "question": e["question"],
            "answer": e["answer"],
            "clean_answers": e["clean_answers"],
            "answerline": f"<b>{e['answer']}</b>",
        } | mm_info_dict
        tossup_dicts.append(tossup_dict)
    tossup_df = pd.DataFrame(tossup_dicts)
    tossup_df.to_csv(f"{packet_dir}/tossups.csv", index=False)


# %%
create_packet(dataset)


# %%
