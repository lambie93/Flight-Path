import json
import airportsdata

data = airportsdata.load("IATA")

rows = []
for code, a in sorted(data.items()):
    if not code or a.get("lat") is None or a.get("lon") is None:
        continue
    rows.append([
        code,
        a["name"],
        a["city"],
        a["country"],
        round(a["lat"], 3),
        round(a["lon"], 3),
    ])

with open("airports.json", "w", encoding="utf-8") as f:
    json.dump(rows, f, ensure_ascii=False, separators=(",", ":"))

print(len(rows), "airports written")
print([r for r in rows if r[0] == "JFK"])