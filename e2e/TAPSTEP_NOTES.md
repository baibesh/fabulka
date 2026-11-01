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
8. **`${var}` is not filled in an `assert.json` expected value.** `json: { "$[0].id": "${orderId}" }`
   compares against the literal `${orderId}` (the failure reads "expected ${orderId}"), while the
   same variable works in `url`, `headers` and `params`. Workaround: `extract` the value and compare
   with `assertTrue: { equals: [...] }`.
9. **A tap on an element more than 6 screens down reports success without clicking it.** On a long
   admin list (27 tall rows) `tapOn: { css: "…[data-code=PT] [data-testid=country-remove]" }` passed,
   but the page had stopped scrolling a row short of the button and nothing was clicked; only the
   next `assertNotVisible` failed. `scrollUntilVisible` on the same element says "not visible after 6
   screens", and its `timeout:` does not lift that cap. A real mouse (or `--viewport 1280x1000`, or a
   few plain `scroll` steps first) clicks it fine. A tap that cannot reach its element should fail
   with the same message, and `timeout:` should replace the screen limit as documented.
10. **`uploadFile` with a relative path attaches a file the page cannot read.** `files: ../fixtures/child.jpg`
    passes validation and the step (the file is found next to the flow), and the input gets a file
    with the right name and type — but `FileReader` fails on it, as if Chromium got the relative path
    unresolved. An absolute path works: `files: "${PWD}/e2e/fixtures/child.jpg"` (run from the repo
    root). The step should hand Chromium the path it resolved.
