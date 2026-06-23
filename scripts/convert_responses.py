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

import pandas as pd


def _read_jsonl(path: str) -> list:
    rows = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def convert_buzz_jsonl(in_path: str, out_path: str) -> int:
    records = _read_jsonl(in_path)
    rows = []
    for rec in records:
        qid = rec["qid"]
        for ro in rec.get("run_outputs", []):
            rows.append(
                {
                    "question_id": qid,
                    "token_position": ro.get("token_position"),
                    "guess": ro.get("guess", ""),
                    "confidence": ro.get("confidence"),
                    "buzz": int(bool(ro.get("buzz"))),
                    "correct": int(bool(ro.get("correct"))),
                }
            )
    df = pd.DataFrame(
        rows,
        columns=[
            "question_id",
            "token_position",
            "guess",
            "confidence",
            "buzz",
            "correct",
        ],
    )
    df.to_csv(out_path, index=False)
    return len(rows)


def convert_bonus_jsonl(in_path: str, out_path: str) -> int:
    records = _read_jsonl(in_path)
    rows = []
    for rec in records:
        qid = rec["qid"]
        for po in rec.get("part_outputs", []):
            rows.append(
                {
                    "question_id": qid,
                    "part_number": po.get("number"),
                    "guess": po.get("guess", ""),
                    "confidence": po.get("confidence"),
                    "explanation": po.get("explanation", ""),
                    "correct": int(bool(po.get("correct"))),
                }
            )
    df = pd.DataFrame(
        rows,
        columns=[
            "question_id",
            "part_number",
            "guess",
            "confidence",
            "explanation",
            "correct",
        ],
    )
    df.to_csv(out_path, index=False)
    return len(rows)


def ensure_dir(path: str):
    os.makedirs(path, exist_ok=True)


def strip_bonus_prefix(fname: str) -> str:
    # Matches: bonus__YYYYMMDD_HHMMSS__whatever.bonus.jsonl
    match = re.match(r"bonus__\d{8}_\d{6}__(.+)", fname)
    return match.group(1) if match else fname


def strip_tossup_prefix(fname: str) -> str:
    # Matches: tossup__YYYYMMDD_HHMMSS__whatever.buzz.jsonl
    match = re.match(r"tossup__\d{8}_\d{6}__(.+)", fname)
    return match.group(1) if match else fname


def main(tournament_dir: str):
    # Find input/output dirs
    bonus_in_dir = os.path.join(tournament_dir, "Outputs", "Bonuses")
    tossup_in_dir = os.path.join(tournament_dir, "Outputs", "Tossups")
    responses_dir = os.path.join(tournament_dir, "responses")
    ensure_dir(responses_dir)

    # Process bonus files
    for in_path in sorted(glob.glob(os.path.join(bonus_in_dir, "*.jsonl"))):
        base_name = os.path.basename(in_path)
        dest_base = strip_bonus_prefix(base_name)
        # Destination: responses/{file_stem}.csv, replacing .jsonl with .csv
        out_name = os.path.splitext(dest_base)[0] + ".bonus.csv"
        out_path = os.path.join(responses_dir, out_name)
        n = convert_bonus_jsonl(in_path, out_path)
        print(f"bonus: {base_name} -> {out_name} ({n} rows)")

    # Process tossup files
    for in_path in sorted(glob.glob(os.path.join(tossup_in_dir, "*.jsonl"))):
        base_name = os.path.basename(in_path)
        dest_base = strip_tossup_prefix(base_name)
        # Destination: responses/{file_stem}.csv, replacing .jsonl with .csv
        out_name = os.path.splitext(dest_base)[0] + ".buzz.csv"
        out_path = os.path.join(responses_dir, out_name)
        n = convert_buzz_jsonl(in_path, out_path)
        print(f"buzz : {base_name} -> {out_name} ({n} rows)")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python convert_responses.py <tournament_directory>")
        sys.exit(1)
    main(sys.argv[1])
