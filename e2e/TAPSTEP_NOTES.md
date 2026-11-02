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
11. **`scroll` sometimes hangs for 90 s with "the page looks stuck" while the page is idle.** With
    the system Chrome every scroll failed this way (even `scroll` on the static /terms, where a
    MutationObserver saw nothing and a real Chrome scrolled fine); `--browser managed`, as CI runs
    it, fixed most of it, but a long directory run still hit it now and then on pages that pass on
    their own. The message blames the page; naming the browser, or saying what did not answer
    (no frame? no scroll end?), would make it actionable.
12. **A `tapOn` right after `openLink` can scroll to an element while the page is still streaming
    in, then miss it.** A footer button below a growing catalog: the step passes, the dialog never
    opens, and only `-v` shows "acted on a page that had not settled (Network(3))". A
    `scrollUntilVisible` first makes it reliable. Printing that warning without `-v`, or retrying
    the scroll once the page settles, would have saved a long bisect.
13. **A `.helper.yaml` matched by the config's `flows:` glob is run as a flow.** With
    `flows: ["flows/**"]` in e2e/config.yaml, `tapstep test e2e/flows --config e2e/config.yaml` ran
    `flows/kazakhstan.helper.yaml` on its own (and failed it: no page open), although directory runs
    are documented to skip helpers. Workaround: keep helpers outside the glob (`e2e/helpers/`).
