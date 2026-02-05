Example Walkthrough for Overly

We’ll be using this simple example workflow to test how our extension handles multi-page recording and walkthrough. Please keep a record of this example workflow as a markdown file in @docs/, documenting what the expected behaviour is, so that we can refer to it later to identify both improvements and regressions.

Each of the following is an expected “step” that should be recorded.

Initial starting location: google.com

Step 1 (INPUT COMMIT): On google.com, the user enters a search query (e.g. “claude code hooks”) into the search bar **and presses Enter**. This should be recorded as a single `input_commit` step (commit occurs on Enter keydown).

Note: Pressing Enter has a side effect of navigating to the search results page; this should **NOT** be recorded as a separate `navigate` step.

Step 2 (CLICK): On the search results page, the user clicks the 1st search result (a link). This has a side effect of navigating to a different website (in this case, anthropic documentation). This action is recorded as a `click` action, NOT `navigate`.

Step 3 (COPY): On the anthropic documentation page, the user copies a paragraph. This is a `copy` action and records the specific text that was copied (by examining the clipboard, not from the screenshot).

Step 4 (NAVIGATE): The user navigates to docs.google.com by typing the url in the browser’s address bar. This is a `navigate` action, which only occurs when the user explicitly changes the URL.

Step 5 (CLICK): On docs.google.com, the user clicks create a new document button. This has a side effect of taking the user to a fresh google doc.

Step 6 (INPUT COMMIT): The user pastes the copied contents onto the page. This is a `paste` action and is currently not recorded. The user clicks the document title input box, which automatically populates a name for the google doc. When the user clicks out of the input box, it counts as an `input_commit` action.

Step 7 (CLICK): The user clicks the google docs logo, which takes the user to the google docs homepage. The user ends the recording here.
