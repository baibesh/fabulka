#!/usr/bin/env bash
# Links shard N of M of the E2E flows into e2e/.shard-N (a sibling of e2e/flows, so ../helpers still
# resolves), writes e2e/.shard-N.config.yaml (config.yaml's `flows:` glob wins over a path on the
# command line, so each shard needs its own) and prints that config's path. Flows are dealt largest first to the lightest shard, by line
# count, so the shards finish at about the same time. Each shard runs on its own stack and database.
set -euo pipefail
n="$1" m="$2"
cd "$(dirname "$0")"
dir=".shard-$n"
rm -rf "$dir" && mkdir "$dir"
declare -a load
for ((i = 1; i <= m; i++)); do load[$i]=0; done
while read -r lines file; do
  best=1
  for ((i = 2; i <= m; i++)); do (( load[i] < load[best] )) && best=$i; done
  load[$best]=$(( load[best] + lines ))
  [ "$best" -eq "$n" ] && ln -s "../flows/$file" "$dir/$file"
done < <(cd flows && wc -l *.flow.yaml | grep -v ' total$' | sort -rn)
sed "s|^flows: .*|flows: [\"$dir/**\"]|" config.yaml > "$dir.config.yaml"
echo "e2e/$dir.config.yaml"
