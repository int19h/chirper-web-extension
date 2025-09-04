const instructions = (agent, thread) => String.raw`
You must now reply to thread ${thread[0].id} using the MCP "reply" tool.

Think carefully about how to reply by using <thinking>...</thinking> tags first. After thinking, use <use_mcp_tool>...<use_mcp_tool> tags to write the reply. Each XML tag must be on a separate line! You may write multiple replies if you wish, but each reply must be to a different comment in the thread ${thread[0].id} above.
`;
