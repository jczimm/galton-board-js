from pathlib import Path

import polars as pl

DATA_DIR = Path(__file__).parent / "data"

# Params that should be parsed as floats; anything else stays a string.
FLOAT_PARAMS = {
    "ballRest",
    "ballFric",
    "paneRest",
    "paneFric",
    "boardRest",
    "boardFric",
}
INT_PARAMS = {"balls", "steps"}


def parse_filename(path: Path) -> dict:
    """Extract key-value parameters encoded as `key-value` segments in the stem."""
    stem = path.stem  # e.g. fromstl_model-boarddef_balls-250_..._ballpositions
    params: dict = {"source_file": path.name}
    for segment in stem.split("_"):
        if "-" not in segment:
            continue
        key, _, value = segment.partition("-")
        if key in INT_PARAMS:
            params[key] = int(value)
        elif key in FLOAT_PARAMS:
            params[key] = float(value)
        else:
            params[key] = value
    return params


def load_all(data_dir: Path = DATA_DIR) -> pl.DataFrame:
    frames = []
    for csv_path in sorted(data_dir.glob("*.csv")):
        params = parse_filename(csv_path)
        df = pl.read_csv(csv_path).with_columns(
            [pl.lit(v).alias(k) for k, v in params.items()]
        )
        frames.append(df)
    return pl.concat(frames, how="diagonal_relaxed")

if __name__ == "__main__":
    df = load_all()
    print(df)
    print(df.schema)
