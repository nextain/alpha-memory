import hashlib

# Configuration for A/B tests (can be loaded from a separate config file or DB)
AB_TEST_CONFIG = {
    "memory_algorithm_experiment": {
        "enabled": True,
        "variants": {
            "control": {"weight": 0.5},
            "treatment": {"weight": 0.5}
        },
        "default_variant": "control"
    }
}

def get_variant(user_id: str, experiment_name: str) -> str:
    config = AB_TEST_CONFIG.get(experiment_name)
    if not config or not config["enabled"]:
        # If experiment is not enabled or not configured, return the default variant
        return config.get("default_variant", "control") if config else "control"

    # Simple hash-based assignment for even distribution
    # Hash the user_id to get a consistent integer value
    hash_val = int(hashlib.md5(user_id.encode()).hexdigest(), 16)

    # Calculate total weight for all variants in the experiment
    total_weight = sum(v["weight"] for v in config["variants"].values())

    # If total weight is zero, return the default to avoid division by zero or incorrect logic
    if total_weight == 0:
        return config.get("default_variant", "control") if config else "control"

    # Assign based on weights
    cumulative_weight = 0
    # Iterate through variants and assign based on the hash value modulo total weight
    for variant_name, variant_props in config["variants"].items():
        cumulative_weight += variant_props["weight"]
        if (hash_val % total_weight) < cumulative_weight:
            return variant_name
    
    # Fallback to default variant if for some reason no variant was assigned (should not happen with correct weights)
    return config.get("default_variant", "control") if config else "control"
