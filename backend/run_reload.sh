#!/bin/bash
# Drives the /admin/reload-redis endpoint in batches until complete.
# Usage: bash run_reload.sh
URL="https://partiqule-production.up.railway.app/admin/reload-redis?key=RowenaRavenclaw2024!&batch=25"
while true; do
  RESP=$(curl -s --max-time 300 "$URL")
  STATUS=$(echo "$RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const r=JSON.parse(d);console.log(r.status+' '+(r.pct||0)+'% '+(r.nextIndex||0)+'/'+(r.total||0)+' reloaded='+(r.reloaded||0)+' failed='+(r.failed||0));}catch{console.log('parse_error');}})")
  echo "$(date +%H:%M:%S) $STATUS"
  if echo "$STATUS" | grep -q "^complete"; then
    echo "Done!"
    break
  fi
  if echo "$STATUS" | grep -q "parse_error\|error"; then
    echo "Error — retrying in 10s"
    sleep 10
  fi
done
