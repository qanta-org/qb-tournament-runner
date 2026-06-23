# %%
import os

import datasets
import pandas as pd

from scripts.hf_dataset_utils import API, download_dataset_snapshot
from scripts.submissions import SubmissionManager

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
# %%


def get_ai_list(dirpath="data/qanta26-playtest/Outputs"):
    model_names = []
    for name in ["Tossups", "Bonuses"]:
        for file in os.listdir(os.path.join(dirpath, name)):
            if file.endswith(".jsonl"):
                model_names.append(file.removesuffix(".jsonl"))
    return model_names


# %%
model_costs_df = pd.read_csv("closed_model_estimates.csv")
all_model_costs = {}
all_model_pricing = {}
for i, row in model_costs_df.iterrows():
    model_id = row["model_id"]
    model_name = model_id.split("/")[-1]
    cost = row["implied_active_params_b"]
    pricing = row["input_price"] + row["output_price"]
    all_model_costs[model_name] = cost
    all_model_pricing[model_name] = pricing


# %%
def get_model_composition(model_name: str) -> int:
    llms = []
    submission = sub.get_submission(model_name)
    steps = submission["workflow"]["steps"]
    for step in steps:
        llms.append(step["model"])
    return list(set(llms))


def get_model_costs(model_name: str) -> int:
    composition = get_model_composition(model_name)
    cost = 0
    pricing = 0
    for llm in composition:
        cost += all_model_costs[llm]
        pricing += all_model_pricing[llm]
    return cost, pricing


def categorize_weight_class(cost: int) -> str:
    if cost < 10:
        return "lightweight"
    elif cost < 50:
        return "midweight"
    else:
        return "heavyweight"


# %%
pairings = [
    (
        "tossup__20260601_201423__Mokshj1__moksh_tossup_multimodal_qa",
        "bonus__20260601_201459__Mokshj1__moksh_bonus_multimodal_qa",
    ),
    (
        "tossup__20260607_171545__nirjharami108__qanta41mini_v1",
        "bonus__20260608_174612__nirjharami108__qanta41_bonus_v1",
    ),
    (
        "tossup__20260614_160005__eshanli__calibrated_3step_tossup_v1",
        "bonus__20260430_183839__168mxie__test-bonus",
    ),
    (
        "tossup__20260614_174018__eshanli__eshan_v3_calibrated_nano",
        "bonus__20260618_023915__168mxie__test-bonus2",
    ),
]
agent_names = ["Alpha", "Bravo", "Charlie", "Delta"]

idx = 0
roster_entries = []
for agent_name, pairing in zip(agent_names, pairings):
    idx += 1
    tossup_model, bonus_model = pairing
    tossup_cost, tossup_pricing = get_model_costs(tossup_model)
    bonus_cost, bonus_pricing = get_model_costs(bonus_model)
    cost = min(tossup_cost, bonus_cost)
    roster_entry = {
        "player_id": f"ai_{idx}",
        "name": agent_name,
        "type": "ai",
        "tossup_model": "__".join(tossup_model.split("__")[2:]),
        "bonus_model": "__".join(bonus_model.split("__")[2:]),
        "tossup_model_cost": tossup_pricing,
        "skill_level": "Mid",
        "weight_class": categorize_weight_class(cost),
    }
    roster_entries.append(roster_entry)
# %%
pd.DataFrame(roster_entries).to_csv("data/qanta26-playtest/ai_roster.csv", index=False)
# %%
