const avatarSize = 32;

let agentsDiv, filterInput, loading, refreshButton, instructionsTextArea;
let agents = [];

async function replyWithAgent(agent) {
    console.log("Reply:", agent);
    const [tab] = await chrome.tabs.query({active: true, lastFocusedWindow: true});
    const loader = document.getElementById(`loader-${agent.id}`);
    loader.style.visibility = "visible";
    try {
        const result = await chrome.tabs.sendMessage(tab.id, {
            replyWith: agent,
            instructions: instructionsTextArea.value.trim()
        });
        if (result.error) {
            alert("Error: " + result.error);
        }
    } finally {
        loader.style.visibility = "hidden";
    }
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
        div.classList.add("agent");
        agentsDiv.appendChild(div);

        const avatarUrl = URL.parse(agent.avatar?.url, "https://cdn.chirper.ai");
        avatarUrl.searchParams.set("aspect_ratio", `1:1`);
        avatarUrl.searchParams.set("crop_gravity", "north");

        const avatarDiv = document.createElement("div");
        div.classList.add("avatar");
        div.append(avatarDiv);

        const img = document.createElement("img");
        img.classList.add("avatar");
        img.width = avatarSize;
        img.height = avatarSize;
        img.src = avatarUrl;
        avatarDiv.append(img);

        const loader = document.createElement("div");
        loader.id = `loader-${agent.id}`;
        loader.classList.add("loader");
        loader.style.width = avatarSize + "px";
        loader.style.height = avatarSize + "px";
        loader.style.visibility = "hidden";
        avatarDiv.append(loader);

        const nameDiv = document.createElement("div");
        nameDiv.classList.add("name");
        nameDiv.textContent = agent.name;
        div.append(nameDiv);
    }
}

async function loadAgents() {
    agents = [];
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    console.log(tab);

    loading.style.visibility = "visible";
    try {
        ({ agents } = await chrome.tabs.sendMessage(tab.id, { agents: true }));
        localStorage.setItem("agents", JSON.stringify(agents));
        console.log(agents);
        await renderAgents();
    } finally {
        loading.style.visibility = "collapsed";
    }
}


window.onload = function () {
    filterInput = document.getElementById("filter");
    loading = document.getElementById("loading");
    refreshButton = document.getElementById("refresh");
    agentsDiv = document.getElementById("agents");
    instructionsTextArea = document.getElementById("instructions");

    try {
        agents = JSON.parse(localStorage.getItem("agents"));
    } catch (e) {
        console.log(`localStorage.getItem("agents") invalid: ${e}`);
    }
    if (Array.isArray(agents)) {
        renderAgents();
    } else {
        loadAgents();
    }

    filterInput.oninput = (() => {
        let timeout;
        return () => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                renderAgents();
            }, 100);
        };
    })();

    refreshButton.onclick = loadAgents;
}
