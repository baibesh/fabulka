#!/usr/bin/env bash
# Links shard N of M of the E2E flows into e2e/.shard-N (a sibling of e2e/flows, so ../helpers still
# resolves) and prints that directory. Flows are dealt largest first to the lightest shard, by line
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
echo "e2e/$dir"
