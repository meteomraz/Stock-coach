name: Update stock history

on:
  workflow_dispatch:
  schedule:
    - cron: "0 6 * * *"

permissions:
  contents: write

env:
  FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true

jobs:
  update-history:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "24"

      - name: Update history
        run: node scripts/update-history.js

      - name: Commit history
        run: |
          git config user.name "github-actions"
          git config user.email "github-actions@github.com"
          git add data/history.json
          git commit -m "Update stock history" || echo "No changes"
          git push
