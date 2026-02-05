Some general rules you should keep in mind:

- Leverage subagents for investigation, gathering context needed for each ticket.
- You should only plan when you have all necessary context to make an informed decision. Do NOT plan or write code without understanding the problem first!
- ALWAYS plan out your changes before implementing. Discuss design tradeoffs with the user. Ask me any questions to gather more detailed specs in the planning stage.
- You MUST write new tests or update existing tests if you modify or add new logic to the codebase. You MUST run ALL affected tests until they pass.
- Update relevant documentation after every significant change. Keep docs up to date.
- You should request a code review from codex (use codex-delegate skill, review workflow) after implementing a new feature or making a bug fix.

Since we'll be reading a lot of files and will have a limited context window, create and use a uniquely named notepad to keep track of background context, investigation findings, key insights, code references, progress, TODOs, questions, etc. This notepad will serve as a living, persistent memory as you work through this task. You MUST keep the notepad up to date as you investigate, such that if we ever start a new session, you can jump back right where we left off (seamlessly). Anything that is not recorded in the notepad could be lost! If you already have a notepad, do not create a new one - use the existing one.

Adopt an iterative approach to problem solving; think, act, reflect – repeat. Follow this structured approach to software development: investigate thoroughly, plan out your changes, review your plan, implement, test, review, report back to the user. Let’s do this!
