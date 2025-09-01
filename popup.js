const avatarSize = 32;

let agentsDiv, filterInput, loading;
let agents = [];

async function replyWithAgent(agent) {
    alert("Reply with agent @" + agent.username);
}

async function renderAgents() {
    // Filter agents by name or by @username.
    let displayedAgents = agents;
    let filter = filterInput.value.toLowerCase().toUpperCase();
    if (filter) {
        if (filter.startsWith("@")) {
            filter = filter.slice(1);
            displayedAgents = agents.filter(agent =>
                agent.username.toLowerCase().toUpperCase().startsWith(filter)
            );
        } else {
            displayedAgents = agents.filter(agent =>
                agent.name.toLowerCase().toUpperCase().includes(filter) ||
                agent.username.toLowerCase().toUpperCase().includes(filter)
            );
        }
    }

    // Render agents as list with highlightable items.
    agentsDiv.innerHTML = "";
    for (const agent of displayedAgents) {
        const div = document.createElement("div");
        div.onclick = () => replyWithAgent(agent);
        div.textContent = agent.name;
        div.classList.add("agent");
        agentsDiv.appendChild(div);

        const avatarUrl = URL.parse(agent.avatar?.url, "https://cdn.chirper.ai");
        avatarUrl.searchParams.set("aspect_ratio", `1:1`);
        avatarUrl.searchParams.set("crop_gravity", "north");
        if (avatarUrl) {
            const img = document.createElement("img");
            img.width = avatarSize;
            img.height = avatarSize;
            img.src = avatarUrl;
            div.prepend(img);
        }
    }
}

async function loadAgents() {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    console.log(tab);

    loading.style.display = "block";
    try {
        agents = await chrome.tabs.sendMessage(tab.id, { agents: true });
        console.log(agents);
        await renderAgents();
    } finally {
        loading.style.display = "none";
    }
}


window.onload = function () {
    agentsDiv = document.getElementById("agents");
    filterInput = document.getElementById("filter");
    loading = document.getElementById("loading");

    loadAgents();

    filterInput.oninput = (() => {
        let timeout;
        return () => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                renderAgents();
            }, 100);
        };
    })();
}
