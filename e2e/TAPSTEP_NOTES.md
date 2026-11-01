# tapstep notes (dogfooding)

Things noticed while using tapstep on Fabulka. Version: 0.13.11.

1. **`--config` with `flows:` still requires a `<FLOW>` argument.** The docs say the `flows:`
   globs replace the directory argument, but `tapstep test --config e2e/config.yaml` fails with
   "the following required arguments were not provided: <FLOW>". Workaround: pass `e2e/flows`.
2. **`-v` on a directory run prints no per-step lines.** Only `environment`, `driver` and the
   report path appear; the per-step ✓/✗ promised by `--verbose` is missing. The JSON report has
   the steps.
3. **Viewport warning in a headless run:** "the browser window could not grow to the 1280x800
   viewport (screen too small?)" shows on a MacBook screen even though the run is headless.
4. **`TAPSTEP_NO_SANDBOX=1` is needed on a plain `ubuntu-latest` runner, not only in containers.**
   The docs mention it for containers; on GitHub's Ubuntu runner AppArmor blocks Chromium's sandbox
   too. Worth saying in the CI section, or detecting it and printing the fix.
5. **The JSON report changes shape between a single flow and a directory.** A directory run gives
   `{ passed, flows: [{ name, passed, steps }] }`, a single flow `{ passed, steps, platform }`, so
   a script reading reports needs two code paths. One shape (a one-element `flows`) would be easier.
6. **"The page was still changing" caught a real bug, but did not say where.** A page-turn library
   ran an endless `requestAnimationFrame` loop that rewrote page styles every frame; tapstep rightly
   never saw the page settle. Finding the cause took a while; naming the element (or selector)
   whose attributes kept changing would have pointed straight at it.
7. **`childOf` failing on a nested element says only "not visible".** `childOf` is the direct parent
   (as documented), so `{ text: "Books in English", childOf: { testId: trust } }` never matches an
   item two levels down, while the screenshot clearly shows it. A hint such as "found inside
   testId=trust, but not as a direct child — use containsDescendants" would have saved three runs.
