# %%
import os
import re
import textwrap

import datasets
import pandas as pd
from rich import print as rprint

from scripts.hf_dataset_utils import API, download_dataset_snapshot
from scripts.submissions import SubmissionManager

TOURNEY_DIR = "data/qanta26-offline"

# %%
download_dataset_snapshot(
    "qanta-challenge/advcal-requests", "hf_datasets/advcal-requests"
)

# %%
sub = SubmissionManager(
    local_outdir="hf_datasets/advcal-requests",
    repo="qanta-challenge/advcal-requests",
    api=API,
)

model_costs_df = pd.read_csv("closed_model_estimates.csv")
LLM_SIZES = {}
LLM_PRICING = {}
for i, row in model_costs_df.iterrows():
    model_id = row["model_id"]
    model_name = model_id.split("/")[-1]
    cost = row["implied_active_params_b"]
    pricing = row["input_price"] + row["output_price"]
    LLM_SIZES[model_name] = cost
    LLM_PRICING[model_name] = pricing
# %%


def get_tossup_model_names(
    dirpath=f"{TOURNEY_DIR}/Outputs/Packet 1 - Jordan/Tossup",
):
    model_names = []
    for file in os.listdir(dirpath):
        if file.endswith(".jsonl"):
            model_names.append(file.removesuffix(".jsonl"))
    return model_names


def get_bonus_model_names(
    dirpath=f"{TOURNEY_DIR}/Outputs/Packet 1 - Jordan/Bonus",
):
    model_names = []
    for file in os.listdir(dirpath):
        if file.endswith(".jsonl"):
            model_names.append(file.removesuffix(".jsonl"))
    return model_names


def get_workflow_composition(submission: dict) -> list[str]:
    workflow = submission["workflow"]
    llms = []
    for step in workflow["steps"]:
        llms.append(step["model"])
    return list(set(llms))


def print_model(model_name: str) -> str:
    submission = sub.get_submission(model_name)
    print(submission.keys())
    workflow = submission["workflow"]
    print("=" * 80)
    print(f"{model_name}:")
    print("=" * 80)
    for step in workflow["steps"]:
        print("--------------------------------")
        print(step["model"])
        print(
            "\n".join(
                [
                    "--- SYSTEM PROMPT START ---",
                    textwrap.fill(step["system_prompt"], width=88),
                    "--- SYSTEM PROMPT END ---",
                ]
            )
        )

    return workflow


def get_hf_model_costs(llm_name: str) -> int:
    # extract suffix of llm_name that is [number]b, e.g. "llama8b" -> "8b", or "granite-13b" -> "13b"
    match = re.search(r"(\d+)b", llm_name)
    if match:
        return int(match.group(1))
    raise ValueError(f"Unknown model size: {llm_name}")


def get_api_model_costs(llm_composition: list[str]) -> int:
    cost = 0
    pricing = 0
    for llm in llm_composition:
        if llm.startswith("claude-sonnet-4-6"):
            llm = "claude-sonnet-4.6"
        cost += LLM_SIZES[llm]
        pricing += LLM_PRICING[llm]
    return cost


def get_model_costs(model_name: str) -> int:
    submission = sub.get_submission(model_name)
    if submission["submission_type"] == "hf_pipeline":
        return get_hf_model_costs(submission["model_name"])
    if submission["submission_type"] == "simple_workflow":
        llm_composition = get_workflow_composition(submission)
        return get_api_model_costs(llm_composition)
    raise ValueError(f"Unknown submission type: {submission['submission_type']}")


def get_model_composition_string(model_name: str) -> str:
    """Returns the composition of LLMs in workflow (if workflow), else primary llm, joined by commas."""
    submission = sub.get_submission(model_name)
    if submission["submission_type"] == "hf_pipeline":
        return submission["model_name"]
    if submission["submission_type"] == "simple_workflow":
        llm_composition = get_workflow_composition(submission)
        return ", ".join(sorted(llm_composition))
    raise ValueError(f"Unknown submission type: {submission['submission_type']}")


def categorize_weight_class(cost: int) -> str:
    if cost <= 10:
        return "lightweight"
    elif cost <= 50:
        return "midweight"
    else:
        return "heavyweight"


def categorize_model_size(model_name: str) -> str:
    cost = get_model_costs(model_name)
    return categorize_weight_class(cost)


def strip_model_prefix(model_key: str) -> str:
    """Strip type/source/timestamp prefix from a JSONL filename, returning Author__model."""
    match = re.search(r"\d{8}_\d{6}__(.+)$", model_key)
    if match:
        return match.group(1)
    return model_key


# %%
TOSSUP_MODELS = get_tossup_model_names()
BONUS_MODELS = get_bonus_model_names()

tossup_names = [
    "Apex",
    "Blitz",
    "Clutch",
    "Dash",
    "Edge",
    "Flash",
    "Glint",
    "Haste",
    "Impulse",
    "Jolt",
    "Kinetic",
    "Laser",
    "Momentum",
    "Nitro",
]

# The Payload Unit: Solid, analytical call signs for deep-knowledge and team-play specialists.
bonus_agents = [
    "Anchor",
    "Bastion",
    "Core",
    "Data",
    "Ensemble",
    "Forge",
    "Guild",
    "Hive",
    "Insight",
    "Junction",
    "Keeper",
    "Ledger",
    "Matrix",
    "Nexus",
]

tossup_roster = []
for i, t_model in enumerate(TOSSUP_MODELS):
    tossup_roster.append(
        {
            "id": f"ai_tossup_{i + 1}",
            "name": tossup_names[i],
            "model": strip_model_prefix(t_model),
            "weight_class": categorize_model_size(t_model),
            "composition": get_model_composition_string(t_model),
        }
    )

bonus_roster = []
for i, b_model in enumerate(BONUS_MODELS):
    bonus_roster.append(
        {
            "id": f"ai_bonus_{i + 1}",
            "name": bonus_agents[i],
            "model": strip_model_prefix(b_model),
            "weight_class": categorize_model_size(b_model),
            "composition": get_model_composition_string(b_model),
        }
    )

pd.DataFrame(tossup_roster).to_csv(f"{TOURNEY_DIR}/ai_tossup_roster.csv", index=False)
pd.DataFrame(bonus_roster).to_csv(f"{TOURNEY_DIR}/ai_bonus_roster.csv", index=False)
# # %%
# pairings = [
#     (
#         "tossup__20260601_201423__Mokshj1__moksh_tossup_multimodal_qa",
#         "bonus__20260601_201459__Mokshj1__moksh_bonus_multimodal_qa",
#     ),
#     (
#         "tossup__20260607_171545__nirjharami108__qanta41mini_v1",
#         "bonus__20260608_174612__nirjharami108__qanta41_bonus_v1",
#     ),
#     (
#         "tossup__20260614_160005__eshanli__calibrated_3step_tossup_v1",
#         "bonus__20260430_183839__168mxie__test-bonus",
#     ),
#     (
#         "tossup__20260614_174018__eshanli__eshan_v3_calibrated_nano",
#         "bonus__20260618_023915__168mxie__test-bonus2",
#     ),
# ]
# agent_names = ["Alpha", "Bravo", "Charlie", "Delta"]

# idx = 0
# roster_entries = []
# for agent_name, pairing in zip(agent_names, pairings):
#     idx += 1
#     tossup_model, bonus_model = pairing
#     tossup_cost, tossup_pricing = get_api_model_costs(tossup_model)
#     bonus_cost, bonus_pricing = get_api_model_costs(bonus_model)
#     cost = min(tossup_cost, bonus_cost)
#     roster_entry = {
#         "player_id": f"ai_{idx}",
#         "name": agent_name,
#         "type": "ai",
#         "tossup_model": "__".join(tossup_model.split("__")[2:]),
#         "bonus_model": "__".join(bonus_model.split("__")[2:]),
#         "tossup_model_cost": tossup_pricing,
#         "skill_level": "Mid",
#         "weight_class": categorize_weight_class(cost),
#         # "model_composition" can be added here as well if needed
#     }
#     print_model(tossup_model)
#     print("--------------------------------")
#     roster_entries.append(roster_entry)
# # %%
# pd.DataFrame(roster_entries).to_csv("data/qanta26-playtest/ai_roster.csv", index=False)
# # %%

# %%
