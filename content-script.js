async function handleAgentsRequest(request, sendResponse) {
    let response = await fetch('https://api.chirper.ai/v1/auth', { credentials: 'include' });
    if (!response.ok) {
        console.error("/v1/auth failed", response);
        return;
    }
    let result = (await response.json()).result;
    const user = result?.user;
    if (!user?.id) {
        console.error("Missing user.id", response);
        return;
    }

    let url = new URL('https://api.chirper.ai/v1/agent');
    url.searchParams.append('user', user.id);
    url.searchParams.append('limit', '1000');
    response = await fetch(url, { credentials: 'include' });
    if (!response.ok) {
        console.error("/v1/agent failed", response);
        return;
    }
    result = (await response.json()).result;
    const agents = result?.agents;
    if (!Array.isArray(agents)) {
        console.error("Missing ['agents']", response);
        return;
    }

    sendResponse(agents);
}

async function handleReplyWith(request, sendResponse) {
    const agent = request.replyWith;
    console.assert(agent);

    const threadId = (document.location.href.match(/\/post\/([a-f0-9]{16})/) || [])[1];
    if (!threadId) {
        console.error("Cannot extract thread ID from URL", document.location.href);
        return;
    }

    let response = await fetch(`https://api.chirper.ai/v1/post/${threadId}`, { credentials: 'include' });
    if (!response.ok) {
        console.error("/v1/post failed", response);
        return;
    }
    let post = (await response.json()).result;
    if (!post) {
        console.error("Missing ['post']", response);
        return;
    }

    let url = new URL('https://api.chirper.ai/v1/post');
    url.searchParams.append('parent', threadId);
    url.searchParams.append('limit', '1000');
    response = await fetch(url, { credentials: 'include' });
    if (!response.ok) {
        console.error("/v1/post?parent= failed", response);
        return;
    }
    const replies = (await response.json()).result?.posts?.map(p => p[0]);
    if (!replies) {
        console.error("Missing or invalid ['posts']", response);
        return;
    }
    const thread = [post, ...replies].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    let prompt = 'System instruction: reply to the following thread using the MCP "reply" tool. Think your reply through carefully inside <thinking>...</thinking> tags before emitting <use_mcp_tool>...<use_mcp_tool>. Each XML tag must be on a separate line. You may write multiple replies if you wish, but each reply must be to a different comment in the thread.\n\n';

    prompt += "# Participants\n\n";
    const seen = new Set();
    for (const { agent } of thread) {
        if (!agent || seen.has(agent.id)) continue;
        seen.add(agent.id);
        console.log("Participant:", agent);
        prompt += `## @${agent.username}\n\n${agent.short}\n\n`;
    }

    prompt += "\n# Posts\n\n";
    for (const post of thread) {
        console.log("Post:", post);
        prompt += (
            "---\n\n" +
            `* ID: ${post.id}\n` +
            `* Author: @${post.agent.username}\n\n` +
            `${post.content}\n\n`
        );
    }

    console.log("Prompt:", prompt);

    response = await fetch(`https://api.chirper.ai/v2/chat/${agent.id}?goal=autonomous`, { credentials: 'include' });
    if (!response.ok) {
        console.error("/v2/chat failed", response);
        return;
    }
    const chat = (await response.json()).result;
    if (!chat?.id) {
        console.error("Missing ['chat']['id']", response);
        return;
    }

    url = new URL('https://api.chirper.ai/v2/message');
    url.searchParams.append('chat', chat.id);
    url.searchParams.append('limit', '1');
    response = await fetch(url, { credentials: 'include' });
    if (!response.ok) {
        console.error("/v2/message failed", response);
        return;
    }
    const messages = (await response.json()).result?.messages;
    if (!Array.isArray(messages)) {
        console.error("Missing or invalid ['messages']", response);
        return;
    }

    // /v2/chat/16880eacc1ec9b3e/emit
    const temp = Date.now()
    response = await fetch(`https://api.chirper.ai/v2/chat/${chat.id}/emit`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            "temp": temp,
            "goal": "autonomous",
            "agent": agent.id,
            "messages": [
                ...messages,
                {
                    "id": `user-${temp}`,
                    "role": "user",
                    "createdAt": new Date().toISOString(),
                    "content": [
                        { "type": "text", "text": prompt }
                    ]
                }
            ]
        })
    });
    if (!response.ok) {
        console.error("/v2/chat/emit failed", response);
        return;
    }

    sendResponse(true);
}

chrome.runtime.onMessage.addListener(
    (request, sender, sendResponse) => {
        console.log("Request:", request);
        if (request.agents) {
            handleAgentsRequest(request, (response) => {
                console.log("Response:", response);
                sendResponse(response)
            });
            return true;
        } else if (request.replyWith) {
            handleReplyWith(request, sendResponse);
            return true;
        }
    }
);