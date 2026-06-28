# %%
"""Convert model response JSONL files to the CSV format the game runner expects.

This script takes a tournament directory path as its argument, finds model output files:
    tournament_dir/Outputs/Bonuses/*.jsonl
    tournament_dir/Outputs/Tossups/*.jsonl

- For bonuses, source files may start with 'bonus__{date_time}__', strip this prefix for the destination file.
- For tossups, source files may start with 'tossup__{date_time}__', strip this prefix for the destination file.
- Destination CSVs go in tournament_dir/responses/ following the same output conventions.
"""

import glob
import json
import os
import re
import sys
from collections import Counter, defaultdict

import pandas as pd


def _read_jsonl(path: str) -> list:
    rows = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def _flatten_buzz_records(records: list):
    for rec in records:
        qid = rec["qid"]
        for ro in rec.get("run_outputs", []):
            yield {
                "question_id": qid,
                "token_position": ro.get("token_position"),
                "guess": ro.get("guess", ""),
                "confidence": ro.get("confidence"),
                "buzz": int(bool(ro.get("buzz"))),
                "correct": int(bool(ro.get("correct"))),
            }


def _flatten_bonus_records(records: list):
    for rec in records:
        qid = rec["qid"]
        for po in rec.get("part_outputs", []):
            yield {
                "question_id": qid,
                "part_number": po.get("number"),
                "guess": po.get("guess", ""),
                "confidence": po.get("confidence"),
                "explanation": po.get("explanation", ""),
                "correct": int(bool(po.get("correct"))),
            }


def convert_buzz_df(records: list, out_path: str) -> int:
    out_df = pd.DataFrame(
        _flatten_buzz_records(records),
        columns=[
            "question_id",
            "token_position",
            "guess",
            "confidence",
            "buzz",
            "correct",
        ],
    )
    out_df.to_csv(out_path, index=False)
    return len(out_df)


def convert_bonus_df(records: list, out_path: str) -> int:
    out_df = pd.DataFrame(
        _flatten_bonus_records(records),
        columns=[
            "question_id",
            "part_number",
            "guess",
            "confidence",
            "explanation",
            "correct",
        ],
    )
    out_df.to_csv(out_path, index=False)
    return len(out_df)


def ensure_dir(path: str):
    os.makedirs(path, exist_ok=True)


def strip_bonus_prefix(fname: str) -> str:
    # Matches: bonus__YYYYMMDD_HHMMSS__whatever.bonus.jsonl
    match = re.match(r"bonus(?:__hf)?__\d{8}_\d{6}__(.+)", fname)
    fname = match.group(1) if match else fname
    return fname.split("/")[-1].removesuffix(".jsonl")


def strip_tossup_prefix(fname: str) -> str:
    # Matches: tossup__YYYYMMDD_HHMMSS__whatever.buzz.jsonl
    match = re.match(r"tossup__\d{8}_\d{6}__(.+)", fname)
    fname = match.group(1) if match else fname
    return fname.split("/")[-1].removesuffix(".jsonl")


def main(tournament_dir: str):
    # Enumerate over packets
    outputs_dir = os.path.join("data", tournament_dir, "Outputs")
    packet_dirpaths = glob.glob(os.path.join(outputs_dir, "Packet *"))
    print(f"Found {len(packet_dirpaths)} packets in {outputs_dir}")
    bonus_records = defaultdict(list)
    tossup_records = defaultdict(list)

    for packet_dirpath in packet_dirpaths:
        packet_dir = os.path.basename(packet_dirpath)
        packet_number = int(packet_dir.split("-")[0].removeprefix("Packet ").strip())
        bonus_in_dir = os.path.join(packet_dirpath, "Bonus")
        for in_path in sorted(glob.glob(os.path.join(bonus_in_dir, "*.jsonl"))):
            records = _read_jsonl(in_path)
            model_name = strip_bonus_prefix(os.path.basename(in_path))
            bonus_records[model_name].extend(records)

        tossup_in_dir = os.path.join(packet_dirpath, "Tossup")
        for in_path in sorted(glob.glob(os.path.join(tossup_in_dir, "*.jsonl"))):
            records = _read_jsonl(in_path)
            model_name = strip_tossup_prefix(os.path.basename(in_path))
            tossup_records[model_name].extend(records)

    responses_dir = os.path.join("data", tournament_dir, "responses")
    ensure_dir(responses_dir)
    # Print out the model names and check if question_id is unique:
    print("# Bonus models:", len(bonus_records))
    model_errors = []
    for model_name, records in bonus_records.items():
        print(f"{model_name}: {len(records)} records")
        if len({r["qid"] for r in records}) != len(records):
            unique_qids = Counter({r["qid"] for r in records})
            print(len(records), len(unique_qids))
            print({k: v for k, v in unique_qids.items() if v > 1})
            print(f"{model_name} has duplicate question_ids")
            model_errors.append(model_name)
            continue
        out_path = os.path.join(responses_dir, f"{model_name}.bonus.csv")
        convert_bonus_df(records, out_path)
        print(f"Wrote {len(records)} records to {out_path}")

    print("\n# Model errors:")
    for model_name in model_errors:
        print(model_name)

    print("\n# Tossup models:", len(tossup_records))
    model_errors = []
    for model_name, records in tossup_records.items():
        print(f"{model_name}: {len(records)} records")
        if len({r["qid"] for r in records}) != len(records):
            print(f"{model_name} has duplicate question_ids")
            model_errors.append(model_name)
            continue
        out_path = os.path.join(responses_dir, f"{model_name}.buzz.csv")
        convert_buzz_df(records, out_path)
        print(f"Wrote {len(records)} records to {out_path}")

    print("\n# Model errors:")
    for model_name in model_errors:
        print(model_name)


# %%
def is_running_in_kernel():
    try:
        from IPython import get_ipython

        shell = get_ipython()
        if shell is None:
            return False
        if "IPKernelApp" in shell.config:
            return True  # Jupyter or other kernel
        if shell.__class__.__name__ == "ZMQInteractiveShell":
            return True  # Jupyter or qtconsole
        return False
    except Exception:
        return False


if __name__ == "__main__":
    if is_running_in_kernel() or len(sys.argv) == 1:
        print("Running in kernel, defaulting to 'qanta26'")
        tournament_dir = "qanta26-offline"
    else:
        tournament_dir = sys.argv[1]
    print(f"Converting responses from {tournament_dir}")
    main(tournament_dir)

# %%
