let manifest = {};
let currentDeck = null;
let currentCardIndex = 0;
let currentTestIndex = 0;
let testAnswers = {};
let testQuestionOptions = {}; // Store shuffled options for each question
let shuffledQuestions = []; // Store shuffled order of questions
let sortedLearnCards = []; // Store dependency-sorted cards for learn mode
let allDecks = [];
let filteredDecks = [];
let searchQuery = '';
let viewMode = 'grid'; // grid, list, or lineage
let cardsViewMode = 'grid'; // grid or list for cards

// Load manifest on page load
document.addEventListener('DOMContentLoaded', function() {
    fetch('manifest.json')
        .then(response => response.json())
        .then(data => {
            manifest = data;
            allDecks = data.decks || [];
            initializeApp();
        })
        .catch(error => console.error('Error loading manifest:', error));
});

function initializeApp() {
    const projectData = manifest.project || {};

    // Populate project info section
    const projectName = document.getElementById('project-name');
    const projectDescription = document.getElementById('project-description');
    const projectVersion = document.getElementById('project-version');

    if (projectName) {
        projectName.textContent = projectData.name || 'Anamnesis Project';
    }
    if (projectDescription) {
        projectDescription.textContent = projectData.description || '';
    }
    if (projectVersion) {
        projectVersion.textContent = projectData.version ? `v${projectData.version}` : '';
    }

    filteredDecks = [...allDecks];
    showDecksView();
    updateViewModeButtons();
}

function showDecksView() {
    hideAllViews();
    document.getElementById('decks-view').classList.remove('hidden');
    applyFiltersAndSort();
    updateDeckStats();
    renderCurrentView();
}

function updateDeckStats() {
    const stats = document.getElementById('deck-stats');
    const totalDecks = allDecks.length;
    const filteredCount = filteredDecks.length;
    const totalCards = allDecks.reduce((sum, deck) => sum + deck.cards.length, 0);

    if (filteredCount < totalDecks) {
        stats.textContent = `Showing ${filteredCount} of ${totalDecks} decks • ${totalCards} total cards`;
    } else {
        stats.textContent = `${totalDecks} deck${totalDecks !== 1 ? 's' : ''} • ${totalCards} total cards`;
    }
}

function applyFiltersAndSort() {
    // Filter by search query
    filteredDecks = allDecks.filter(deck => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        const name = (deck.metadata.name || deck.id).toLowerCase();
        const description = (deck.metadata.description || '').toLowerCase();
        return name.includes(query) || description.includes(query);
    });

    // Sort decks using topological sort based on dependencies
    filteredDecks = topologicalSortDecks(filteredDecks);
}

function renderCurrentView() {
    if (viewMode === 'lineage') {
        renderLineageView();
    } else {
        renderDecksList();
    }
}

function renderDecksList() {
    const decksList = document.getElementById('decks-list');
    const lineageContainer = document.getElementById('homescreen-lineage');

    // Show decks list, hide lineage
    decksList.classList.remove('hidden');
    lineageContainer.classList.add('hidden');

    decksList.innerHTML = '';
    decksList.className = viewMode === 'grid' ? 'decks-grid' : 'decks-list-view';

    if (filteredDecks.length === 0) {
        decksList.innerHTML = '<div class="no-results">No decks found matching your search.</div>';
        return;
    }

    filteredDecks.forEach((deck, index) => {
        const deckEl = document.createElement('div');
        deckEl.className = 'deck-card';
        deckEl.style.animationDelay = `${index * 0.05}s`;

        const dependsOnCount = deck.metadata.depends_on?.length || 0;
        const dependencyBadge = dependsOnCount > 0
            ? `<span class="dependency-badge" title="Depends on ${dependsOnCount} deck(s)">${dependsOnCount} dependencies</span>`
            : '';

        deckEl.innerHTML = `
            <h3>${deck.metadata.name || deck.id}</h3>
            <p>${deck.metadata.description || 'No description available'}</p>
            <div class="deck-meta">
                <span>${deck.cards.length} card${deck.cards.length !== 1 ? 's' : ''}</span>
                ${dependencyBadge}
            </div>
        `;
        deckEl.onclick = () => selectDeck(deck.id);
        decksList.appendChild(deckEl);
    });
}

function renderLineageView() {
    const decksList = document.getElementById('decks-list');
    const lineageContainer = document.getElementById('homescreen-lineage');

    // Hide decks list, show lineage
    decksList.classList.add('hidden');
    lineageContainer.classList.remove('hidden');

    renderHomescreenLineage();
}


function selectDeck(deckId) {
    currentDeck = allDecks.find(d => d.id === deckId);
    if (currentDeck) {
        showDeckView();
    }
}

function showDeckView() {
    hideAllViews();
    const deckView = document.getElementById('deck-view');

    // Force animation retrigger by removing and re-adding the element to the DOM flow
    deckView.style.animation = 'none';
    deckView.offsetHeight; // Trigger reflow
    deckView.style.animation = '';

    deckView.classList.remove('hidden');

    const deck = currentDeck;
    document.getElementById('deck-title').textContent = deck.metadata.name || deck.id;
    document.getElementById('deck-description').textContent = deck.metadata.description || 'No description available';

    renderDeckDependencies();
    cardsViewMode = 'grid'; // Reset to grid view
    renderCardsList();
    updateCardsViewModeButtons();
}

function renderDeckDependencies() {
    const container = document.getElementById('deck-dependencies');

    // Create header with title and fullscreen button (same structure as homescreen)
    const header = document.createElement('div');
    header.className = 'lineage-section-header';
    const h3 = document.createElement('h3');
    h3.className = 'lineage-section-title';
    h3.textContent = 'Deck Dependencies';
    header.appendChild(h3);

    const fullscreenBtn = document.createElement('button');
    fullscreenBtn.className = 'fullscreen-btn';
    fullscreenBtn.title = 'Toggle Fullscreen';
    fullscreenBtn.id = 'deck-dependencies-fullscreen-btn';
    fullscreenBtn.onclick = () => toggleDeckDependenciesFullscreen();
    fullscreenBtn.innerHTML = `
        <svg id="deck-fullscreen-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
        </svg>
    `;
    header.appendChild(fullscreenBtn);

    container.innerHTML = '';
    container.appendChild(header);

    // Create lineage graph container (use same class as homescreen for consistent styling)
    const graphContainer = document.createElement('div');
    graphContainer.className = 'homescreen-lineage-graph';
    container.appendChild(graphContainer);

    // Build and render the limited lineage
    const lineageData = buildDeckLineage(currentDeck.id, true);

    if (lineageData.nodes.length === 0 || (lineageData.nodes.length === 1 && lineageData.nodes[0].id === currentDeck.id)) {
        graphContainer.innerHTML = '<p class="no-lineage">No dependencies for this deck.</p>';
        return;
    }

    renderDeckLineageGraph(lineageData, currentDeck.id, graphContainer, false);
    enableDragToPan(graphContainer);
}

function setCardsViewMode(mode) {
    cardsViewMode = mode;
    renderCardsList();
    updateCardsViewModeButtons();
}

function updateCardsViewModeButtons() {
    const gridBtn = document.getElementById('cards-view-grid');
    const listBtn = document.getElementById('cards-view-list');

    if (gridBtn) gridBtn.classList.toggle('active', cardsViewMode === 'grid');
    if (listBtn) listBtn.classList.toggle('active', cardsViewMode === 'list');
}

function renderCardsList() {
    const cardsList = document.getElementById('cards-list');

    cardsList.classList.remove('hidden');

    cardsList.innerHTML = '';
    cardsList.className = cardsViewMode === 'grid' ? 'cards-list' : 'cards-list-view';

    // Sort cards topologically based on dependencies
    const sortedCards = topologicalSortCards(currentDeck.cards);

    sortedCards.forEach((card, index) => {
        const cardEl = document.createElement('div');
        cardEl.className = 'card-item';

        const cardName = card.display_name || card.id;

        if (cardsViewMode === 'grid') {
            // Grid view: clickable card with cycling states
            let clickState = 0;

            cardEl.innerHTML = `
                <h3 class="card-title">${cardName}</h3>
            `;

            cardEl.onclick = () => {
                clickState = (clickState + 1) % 3;

                if (clickState === 0) {
                    // Show display name
                    cardEl.innerHTML = `<h3 class="card-title">${cardName}</h3>`;
                    cardEl.style.background = '';
                } else if (clickState === 1) {
                    // Show question
                    cardEl.innerHTML = `
                        <h3 class="card-title" style="font-size: 1.2rem; margin-bottom: 0.5rem;">Question</h3>
                        <p class="card-content-text">${card.front}</p>
                    `;
                    cardEl.style.background = 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.05))';
                } else {
                    // Show answer
                    cardEl.innerHTML = `
                        <h3 class="card-title" style="font-size: 1.2rem; margin-bottom: 0.5rem;">Answer</h3>
                        <p class="card-content-text">${card.back}</p>
                    `;
                    cardEl.style.background = 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(5, 150, 105, 0.05))';
                }
            };
        } else {
            // List view: full card display without dependency info
            cardEl.innerHTML = `
                <div class="card-header-list">
                    <strong class="card-name-list">${cardName}</strong>
                </div>
                <div class="card-content-list">
                    <p><strong>Question:</strong> ${card.front}</p>
                    <p><strong>Answer:</strong> ${card.back}</p>
                </div>
            `;
        }
        cardsList.appendChild(cardEl);
    });
}

function startLearning() {
    currentCardIndex = 0;

    // Sort cards by dependency order
    sortedLearnCards = topologicalSortCards(currentDeck.cards);

    hideAllViews();
    document.getElementById('learn-view').classList.remove('hidden');
    showCard();
    updateLearningProgress();
}

function startTest() {
    currentTestIndex = 0;
    testAnswers = {};
    testQuestionOptions = {};

    // Sort questions by dependency order
    shuffledQuestions = topologicalSortCards(currentDeck.cards);

    hideAllViews();
    document.getElementById('test-view').classList.remove('hidden');
    showTestQuestion();
    updateTestProgress();
}

function updateLearningProgress() {
    const progress = ((currentCardIndex + 1) / sortedLearnCards.length) * 100;
    document.getElementById('learn-progress').style.width = progress + '%';
}

function updateTestProgress() {
    const progress = shuffledQuestions.length > 0
        ? ((currentTestIndex + 1) / shuffledQuestions.length) * 100
        : 0;
    document.getElementById('test-progress').style.width = progress + '%';
}

function showCard() {
    if (currentCardIndex >= sortedLearnCards.length) {
        showCompletionMessage('Learning session complete!', 'You\'ve reviewed all cards in this deck.');
        backToDeck();
        return;
    }

    const card = sortedLearnCards[currentCardIndex];
    document.getElementById('current-card').textContent = currentCardIndex + 1;
    document.getElementById('total-cards').textContent = sortedLearnCards.length;
    document.getElementById('card-front').textContent = card.front;
    document.getElementById('card-back').textContent = card.back;

    // Reset flip state
    const flashcard = document.querySelector('.flashcard');
    flashcard.classList.remove('flipped');

    updateLearningProgress();
}

function flipCard(element) {
    element.classList.toggle('flipped');
}

function nextCard() {
    if (currentCardIndex < sortedLearnCards.length - 1) {
        currentCardIndex++;
        showCard();
    } else {
        currentCardIndex++;
        showCard(); // This will trigger the completion message and return to deck
    }
}

function prevCard() {
    if (currentCardIndex > 0) {
        currentCardIndex--;
        showCard();
    }
}

function showTestQuestion() {
    if (currentTestIndex >= shuffledQuestions.length) {
        showTestResults();
        return;
    }

    const card = shuffledQuestions[currentTestIndex];
    document.getElementById('test-current').textContent = currentTestIndex + 1;
    document.getElementById('test-total').textContent = shuffledQuestions.length;
    document.getElementById('question-text').textContent = card.front;

    const correctAnswer = card.back;
    const previousAnswer = testAnswers[currentTestIndex];

    // Check if we already have shuffled options for this question
    let options;
    if (testQuestionOptions[currentTestIndex]) {
        // Use previously shuffled options
        options = testQuestionOptions[currentTestIndex];
    } else {
        // Generate and store new shuffled options
        // Get other answers from different cards
        const otherAnswers = shuffledQuestions
            .filter(c => c.back !== correctAnswer)
            .map(c => c.back);

        // Randomly select 3 incorrect options (or fewer if not enough cards)
        const numIncorrect = Math.min(3, otherAnswers.length);
        const shuffledOthers = otherAnswers.sort(() => Math.random() - 0.5);
        const incorrectOptions = shuffledOthers.slice(0, numIncorrect);

        // Combine correct answer with incorrect options and shuffle
        options = [correctAnswer, ...incorrectOptions].sort(() => Math.random() - 0.5);

        // Store for future use
        testQuestionOptions[currentTestIndex] = options;
    }

    const answerOptions = document.getElementById('answer-options');
    answerOptions.innerHTML = '';

    options.forEach((answer, index) => {
        const btn = document.createElement('button');
        btn.className = 'answer-option';
        btn.textContent = answer;
        btn.style.animationDelay = `${index * 0.05}s`;

        // If this question was already answered, show the previous answer state
        if (previousAnswer !== undefined) {
            btn.disabled = true;
            btn.style.cursor = 'not-allowed';

            if (answer === previousAnswer) {
                if (answer === correctAnswer) {
                    btn.classList.add('correct');
                } else {
                    btn.classList.add('incorrect');
                }
            } else if (answer === correctAnswer && previousAnswer !== correctAnswer) {
                // Show the correct answer if user selected wrong
                btn.classList.add('correct');
            }
        } else {
            // Allow selection only if not previously answered
            btn.onclick = () => selectAnswer(answer, correctAnswer, btn);
        }

        answerOptions.appendChild(btn);
    });

    updateTestProgress();
}

function selectAnswer(selected, correct, element) {
    testAnswers[currentTestIndex] = selected;

    // Add visual feedback
    if (selected === correct) {
        element.classList.add('correct');
    } else {
        element.classList.add('incorrect');
        // Show correct answer
        document.querySelectorAll('.answer-option').forEach(btn => {
            if (btn.textContent === correct) {
                btn.classList.add('correct');
            }
        });
    }

    // Disable all options after selection
    document.querySelectorAll('.answer-option').forEach(btn => {
        btn.disabled = true;
        btn.style.cursor = 'not-allowed';
    });
}

function nextQuestion() {
    if (currentTestIndex < currentDeck.cards.length - 1) {
        currentTestIndex++;
        showTestQuestion();
    } else {
        showTestResults();
    }
}

function prevQuestion() {
    if (currentTestIndex > 0) {
        currentTestIndex--;
        showTestQuestion();
    }
}

function showTestResults() {
    const correct = Object.entries(testAnswers).filter(([index, answer]) => {
        return answer === shuffledQuestions[index].back;
    }).length;

    const total = shuffledQuestions.length;
    const percentage = Math.round((correct / total) * 100);

    let message = 'Great job!';

    if (percentage === 100) {
        message = 'Perfect score!';
    } else if (percentage >= 80) {
        message = 'Excellent work!';
    } else if (percentage >= 60) {
        message = 'Good effort!';
    } else {
        message = 'Keep practicing!';
    }

    showCompletionMessage(
        'Test Complete!',
        `${message}\n\nScore: ${correct}/${total} (${percentage}%)`
    );
    backToDeck();
}

function showCompletionMessage(title, message) {
    // Simple alert for now - could be enhanced with a custom modal
    alert(title + '\n\n' + message);
}

function backToDeck() {
    showDeckView();
}

function hideAllViews() {
    document.querySelectorAll('.view').forEach(view => {
        view.classList.add('hidden');
    });
}

// Topological sorting functions
function topologicalSortDecks(decks) {
    const sorted = [];
    const visited = new Set();
    const visiting = new Set();

    // Create a map for quick deck lookup
    const deckMap = new Map(decks.map(d => [d.id, d]));

    function visit(deckId) {
        if (visited.has(deckId)) return;
        if (visiting.has(deckId)) {
            // Circular dependency detected, skip
            return;
        }

        const deck = deckMap.get(deckId);
        if (!deck) return;

        visiting.add(deckId);

        // Visit dependencies first
        const dependencies = deck.metadata.depends_on || [];
        dependencies.forEach(depId => {
            if (deckMap.has(depId)) {
                visit(depId);
            }
        });

        visiting.delete(deckId);
        visited.add(deckId);
        sorted.push(deck);
    }

    // Visit all decks
    decks.forEach(deck => visit(deck.id));

    return sorted;
}

function getDeckDepth(deckId, decks) {
    const deckMap = new Map(decks.map(d => [d.id, d]));
    const visited = new Set();

    function getDepth(id) {
        if (visited.has(id)) return 0; // Circular dependency
        visited.add(id);

        const deck = deckMap.get(id);
        if (!deck) return 0;

        const dependencies = deck.metadata.depends_on || [];
        if (dependencies.length === 0) return 0;

        const maxDepth = Math.max(...dependencies.map(depId => getDepth(depId)));
        return maxDepth + 1;
    }

    return getDepth(deckId);
}

function topologicalSortCards(cards) {
    const sorted = [];
    const visited = new Set();
    const visiting = new Set();

    // Create a map for quick card lookup
    const cardMap = new Map(cards.map(c => [c.id, c]));

    function visit(cardId) {
        if (visited.has(cardId)) return;
        if (visiting.has(cardId)) {
            // Circular dependency detected, skip
            return;
        }

        const card = cardMap.get(cardId);
        if (!card) return;

        visiting.add(cardId);

        // Visit dependency first (cards have single dependency)
        if (card.depends_on && cardMap.has(card.depends_on)) {
            visit(card.depends_on);
        }

        visiting.delete(cardId);
        visited.add(cardId);
        sorted.push(card);
    }

    // Visit all cards
    cards.forEach(card => visit(card.id));

    return sorted;
}

// Search and filter functions
function handleSearch(event) {
    searchQuery = event.target.value;
    applyFiltersAndSort();
    renderCurrentView();
    updateDeckStats();
}

function setViewMode(mode) {
    viewMode = mode;
    renderCurrentView();
    updateViewModeButtons();
}

function updateViewModeButtons() {
    const gridBtn = document.getElementById('view-grid');
    const listBtn = document.getElementById('view-list');
    const lineageBtn = document.getElementById('view-lineage');

    if (gridBtn) gridBtn.classList.toggle('active', viewMode === 'grid');
    if (listBtn) listBtn.classList.toggle('active', viewMode === 'list');
    if (lineageBtn) lineageBtn.classList.toggle('active', viewMode === 'lineage');
}

// Homescreen lineage visualization
function renderHomescreenLineage() {
    const container = document.getElementById('homescreen-lineage-content');
    if (!allDecks || allDecks.length === 0) return;

    // Build complete lineage for all decks
    const lineageData = buildCompleteDeckLineage();

    if (lineageData.nodes.length === 0) {
        container.innerHTML = '<p class="no-lineage">No deck dependencies to display.</p>';
        return;
    }

    const graphDiv = document.createElement('div');
    graphDiv.className = 'homescreen-lineage-graph';

    renderDeckLineageGraph(lineageData, null, graphDiv, true);
    container.innerHTML = '';
    container.appendChild(graphDiv);

    // Enable drag to pan for homescreen too
    enableDragToPan(graphDiv);
}

function buildCompleteDeckLineage() {
    const visited = new Set();
    const lineage = { nodes: [], edges: [] };

    function traverse(id, depth = 0) {
        if (visited.has(id)) return;
        visited.add(id);

        const deck = allDecks.find(d => d.id === id);
        if (!deck) return;

        lineage.nodes.push({
            id: id,
            name: deck.metadata.name || id,
            depth: depth,
            cardCount: deck.cards.length,
            isCurrent: false
        });

        // Dependencies are to the LEFT (lower depth)
        const dependsOn = deck.metadata.depends_on || [];
        dependsOn.forEach(depId => {
            lineage.edges.push({ from: depId, to: id });
            traverse(depId, depth - 1);
        });

        // Dependents are to the RIGHT (higher depth)
        allDecks.forEach(d => {
            if ((d.metadata.depends_on || []).includes(id) && !visited.has(d.id)) {
                lineage.edges.push({ from: id, to: d.id });
                traverse(d.id, depth + 1);
            }
        });
    }

    // Start from decks with no dependencies (root nodes on the left)
    const rootDecks = allDecks.filter(d => !d.metadata.depends_on || d.metadata.depends_on.length === 0);
    rootDecks.forEach(deck => traverse(deck.id, 0));

    // Also traverse any remaining unvisited decks (in case of circular deps)
    allDecks.forEach(deck => {
        if (!visited.has(deck.id)) {
            traverse(deck.id, 0);
        }
    });

    return lineage;
}

// Deck lineage visualization
function showDeckLineage(deckId) {
    hideAllViews();
    document.getElementById('lineage-view').classList.remove('hidden');
    document.getElementById('lineage-title').textContent = 'Deck Dependency Graph';

    const lineageData = buildDeckLineage(deckId, true); // Pass true for limited context
    const lineageGraph = document.getElementById('lineage-graph');
    renderDeckLineageGraph(lineageData, deckId);

    // Enable drag-to-pan
    enableDragToPan(lineageGraph);
}

function buildDeckLineage(deckId, limitContext = false) {
    const visited = new Set();
    const lineage = { nodes: [], edges: [] };
    const allNodes = new Map(); // Store all discovered nodes

    // First pass: discover all connected nodes
    function discoverNodes(id, depth = 0) {
        if (visited.has(id)) return;
        visited.add(id);

        const deck = allDecks.find(d => d.id === id);
        if (!deck) return;

        allNodes.set(id, {
            id: id,
            name: deck.metadata.name || id,
            depth: depth,
            cardCount: deck.cards.length,
            isCurrent: id === deckId
        });

        // Dependencies are to the LEFT (lower depth)
        const dependsOn = deck.metadata.depends_on || [];
        dependsOn.forEach(depId => {
            lineage.edges.push({ from: depId, to: id });
            discoverNodes(depId, depth - 1);
        });

        // Dependents are to the RIGHT (higher depth)
        allDecks.forEach(d => {
            if ((d.metadata.depends_on || []).includes(id) && !visited.has(d.id)) {
                lineage.edges.push({ from: id, to: d.id });
                discoverNodes(d.id, depth + 1);
            }
        });
    }

    discoverNodes(deckId);

    // If limiting context, filter to current + 1 before + 1 after
    if (limitContext) {
        const currentNode = allNodes.get(deckId);
        const filteredNodes = new Set([deckId]);
        const filteredEdges = [];

        // Get nodes one level before (dependencies of current - to the LEFT)
        const currentDeck = allDecks.find(d => d.id === deckId);
        const dependsOn = currentDeck?.metadata.depends_on || [];
        dependsOn.forEach(depId => filteredNodes.add(depId));

        // Get nodes one level after (decks that depend on current - to the RIGHT)
        allDecks.forEach(d => {
            if ((d.metadata.depends_on || []).includes(deckId)) {
                filteredNodes.add(d.id);
            }
        });

        // Filter edges to only include those between filtered nodes
        lineage.edges.forEach(edge => {
            if (filteredNodes.has(edge.from) && filteredNodes.has(edge.to)) {
                filteredEdges.push(edge);
            }
        });

        // Convert filtered nodes to array
        lineage.nodes = Array.from(filteredNodes).map(id => allNodes.get(id)).filter(n => n);
        lineage.edges = filteredEdges;
    } else {
        lineage.nodes = Array.from(allNodes.values());
    }

    return lineage;
}

function renderDeckLineageGraph(lineage, currentId, containerEl = null, isHomescreen = false) {
    const container = containerEl || document.getElementById('lineage-graph');
    container.innerHTML = '';

    if (lineage.nodes.length === 0) {
        container.innerHTML = '<p class="no-lineage">No deck dependencies to display.</p>';
        return;
    }

    if (lineage.nodes.length === 1 && currentId) {
        container.innerHTML = '<p class="no-lineage">This deck has no dependencies and is not a dependency of any other deck.</p>';
        return;
    }

    // Create canvas for horizontal layout
    const canvas = document.createElement('div');
    canvas.className = 'lineage-canvas';
    container.appendChild(canvas);

    // Sort nodes by depth for proper hierarchy display
    const maxDepth = Math.max(...lineage.nodes.map(n => n.depth));
    const minDepth = Math.min(...lineage.nodes.map(n => n.depth));
    const depthRange = maxDepth - minDepth;

    // Group nodes by depth for vertical positioning
    const nodesByDepth = new Map();
    lineage.nodes.forEach(node => {
        const depth = node.depth;
        if (!nodesByDepth.has(depth)) {
            nodesByDepth.set(depth, []);
        }
        nodesByDepth.get(depth).push(node);
    });

    // Calculate positions and create nodes (horizontal layout: left to right)
    const nodePositions = new Map();
    const horizontalSpacing = 300; // Space between depth levels (left to right)
    const verticalSpacing = 180; // Space between siblings (top to bottom)

    nodesByDepth.forEach((nodes, depth) => {
        nodes.forEach((node, index) => {
            const nodeEl = document.createElement('div');
            nodeEl.className = 'lineage-node deck-node' + (node.isCurrent ? ' current' : '');
            nodeEl.setAttribute('data-node-id', node.id);

            // Position horizontally by depth, vertically by index
            const x = (depth - minDepth) * horizontalSpacing + 50;
            const y = index * verticalSpacing + 50;

            nodeEl.style.position = 'absolute';
            nodeEl.style.left = `${x}px`;
            nodeEl.style.top = `${y}px`;
            nodeEl.style.minWidth = '220px';
            nodeEl.style.maxWidth = '220px';

            nodeEl.innerHTML = `
                <div class="node-name" style="word-wrap: break-word; overflow-wrap: break-word;">${node.name}</div>
                <div class="node-meta">${node.cardCount} cards</div>
            `;
            nodeEl.onclick = () => {
                if (isHomescreen) {
                    // Homescreen - exit fullscreen if active, then navigate to deck view
                    if (document.fullscreenElement) {
                        document.exitFullscreen().then(() => {
                            selectDeck(node.id);
                        }).catch(() => {
                            selectDeck(node.id);
                        });
                    } else {
                        selectDeck(node.id);
                    }
                } else if (containerEl) {
                    // Deck view embedded - just navigate
                    selectDeck(node.id);
                } else {
                    // Lineage view - close and navigate
                    document.getElementById('lineage-view').classList.add('hidden');
                    selectDeck(node.id);
                }
            };
            canvas.appendChild(nodeEl);
            nodePositions.set(node.id, { x, y, element: nodeEl });
        });
    });

    // Set canvas size based on content
    const maxNodesAtDepth = Math.max(...Array.from(nodesByDepth.values()).map(nodes => nodes.length));
    const canvasWidth = (depthRange + 1) * horizontalSpacing + 300;
    const canvasHeight = Math.max(maxNodesAtDepth * verticalSpacing + 100, 300); // Minimum 300px height, 50px top + 50px bottom margin

    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;

    // Set container min-height to accommodate the canvas
    if (containerEl) {
        containerEl.style.minHeight = `${canvasHeight + 50}px`;
    }

    // Draw edges between nodes
    if (lineage.edges.length > 0) {
        renderEdgesHorizontal(canvas, lineage.edges, nodePositions);
    }
}

function renderEdgesHorizontal(canvas, edges, nodePositions) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'lineage-edges');
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.pointerEvents = 'none';
    svg.style.zIndex = '0';

    canvas.insertBefore(svg, canvas.firstChild);

    // Wait for layout to complete
    setTimeout(() => {
        edges.forEach(edge => {
            const fromPos = nodePositions.get(edge.from);
            const toPos = nodePositions.get(edge.to);

            if (!fromPos || !toPos) return;

            const fromEl = fromPos.element;
            const toEl = toPos.element;

            // Get element dimensions
            const fromWidth = fromEl.offsetWidth;
            const fromHeight = fromEl.offsetHeight;
            const toHeight = toEl.offsetHeight;

            // Calculate connection points (right of from, left of to)
            const x1 = fromPos.x + fromWidth;
            const y1 = fromPos.y + fromHeight / 2;
            const x2 = toPos.x;
            const y2 = toPos.y + toHeight / 2;

            // Create curved path with horizontal bezier
            const midX = (x1 + x2) / 2;
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            const d = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
            path.setAttribute('d', d);
            path.setAttribute('stroke', '#4f46e5');
            path.setAttribute('stroke-width', '2');
            path.setAttribute('fill', 'none');
            path.setAttribute('opacity', '0.5');
            path.setAttribute('class', 'edge-path');

            // Add arrow marker
            const arrowId = `arrow-${edge.from}-${edge.to}-${Math.random().toString(36).substr(2, 9)}`;
            const defs = svg.querySelector('defs') || svg.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'defs'));
            const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
            marker.setAttribute('id', arrowId);
            marker.setAttribute('markerWidth', '10');
            marker.setAttribute('markerHeight', '10');
            marker.setAttribute('refX', '9');
            marker.setAttribute('refY', '3');
            marker.setAttribute('orient', 'auto');
            marker.setAttribute('markerUnits', 'strokeWidth');
            const arrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            arrowPath.setAttribute('d', 'M0,0 L0,6 L9,3 z');
            arrowPath.setAttribute('fill', '#4f46e5');
            arrowPath.setAttribute('opacity', '0.5');
            marker.appendChild(arrowPath);
            defs.appendChild(marker);

            path.setAttribute('marker-end', `url(#${arrowId})`);
            svg.appendChild(path);
        });
    }, 50);
}

function enableDragToPan(container) {
    let isDragging = false;
    let startX, startY, scrollLeft, scrollTop;

    container.addEventListener('mousedown', (e) => {
        // Only drag on canvas background, not on nodes
        if (e.target.classList.contains('lineage-node') ||
            e.target.closest('.lineage-node')) {
            return;
        }

        isDragging = true;
        container.style.cursor = 'grabbing';
        startX = e.pageX - container.offsetLeft;
        startY = e.pageY - container.offsetTop;
        scrollLeft = container.scrollLeft;
        scrollTop = container.scrollTop;
        e.preventDefault();
    });

    container.addEventListener('mouseleave', () => {
        isDragging = false;
        container.style.cursor = 'grab';
    });

    container.addEventListener('mouseup', () => {
        isDragging = false;
        container.style.cursor = 'grab';
    });

    container.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
        const x = e.pageX - container.offsetLeft;
        const y = e.pageY - container.offsetTop;
        const walkX = (x - startX) * 1.5; // Multiply for faster scroll
        const walkY = (y - startY) * 1.5;
        container.scrollLeft = scrollLeft - walkX;
        container.scrollTop = scrollTop - walkY;
    });
}

// Card lineage visualization
function showCardLineage(cardId, event) {
    if (event) event.stopPropagation();

    hideAllViews();
    document.getElementById('lineage-view').classList.remove('hidden');
    document.getElementById('lineage-title').textContent = 'Card Relationships';

    const lineageData = buildCardLineage(cardId);
    renderSingleCardLineageView(lineageData, cardId);
}

function buildCardLineage(cardId) {
    const visited = new Set();
    const lineage = { nodes: [], edges: [] };

    function findCard(id) {
        for (const deck of allDecks) {
            const card = deck.cards.find(c => c.id === id);
            if (card) return { card, deckId: deck.id, deckName: deck.metadata.name || deck.id };
        }
        return null;
    }

    function traverse(id, depth = 0) {
        if (visited.has(id)) return;
        visited.add(id);

        const result = findCard(id);
        if (!result) return;

        const { card, deckId, deckName } = result;
        lineage.nodes.push({
            id: id,
            front: card.front,
            deckName: deckName,
            depth: depth,
            isCurrent: id === cardId
        });

        // Traverse dependency (parent card on the left)
        if (card.depends_on) {
            lineage.edges.push({ from: card.depends_on, to: id });
            traverse(card.depends_on, depth - 1);
        }

        // Find cards that depend on this card (children on the right)
        allDecks.forEach(deck => {
            deck.cards.forEach(c => {
                if (c.depends_on === id && !visited.has(c.id)) {
                    lineage.edges.push({ from: id, to: c.id });
                    traverse(c.id, depth + 1);
                }
            });
        });
    }

    traverse(cardId);
    return lineage;
}

function renderSingleCardLineageView(lineage, currentId) {
    const container = document.getElementById('lineage-graph');
    container.innerHTML = '';

    if (lineage.nodes.length === 1) {
        container.innerHTML = '<p class="no-lineage">This card has no related cards.</p>';
        return;
    }

    const maxDepth = Math.max(...lineage.nodes.map(n => n.depth));
    const minDepth = Math.min(...lineage.nodes.map(n => n.depth));

    lineage.nodes.forEach(node => {
        const nodeEl = document.createElement('div');
        nodeEl.className = 'lineage-node card-lineage-node' + (node.isCurrent ? ' current' : '');
        nodeEl.style.marginLeft = `${(node.depth - minDepth) * 40}px`;

        nodeEl.innerHTML = `
            <div class="node-name">${node.front}</div>
            <div class="node-meta">
                <span>${node.deckName}</span>
            </div>
        `;
        container.appendChild(nodeEl);
    });
}

function closeLineageView() {
    // Exit fullscreen if active
    if (document.fullscreenElement) {
        document.exitFullscreen();
    }
    document.getElementById('lineage-view').classList.add('hidden');
    showDeckView();
}

function toggleHomescreenLineageFullscreen() {
    const lineageContainer = document.getElementById('homescreen-lineage');
    const fullscreenIcon = document.getElementById('homescreen-fullscreen-icon');

    if (!document.fullscreenElement) {
        lineageContainer.requestFullscreen().then(() => {
            // Update icon to exit fullscreen
            if (fullscreenIcon) {
                fullscreenIcon.innerHTML = '<path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>';
            }
        }).catch(err => {
            console.error('Error entering fullscreen:', err);
        });
    } else {
        document.exitFullscreen();
    }
}

function toggleDeckDependenciesFullscreen() {
    const deckDependenciesContainer = document.getElementById('deck-dependencies');
    const fullscreenIcon = document.getElementById('deck-fullscreen-icon');

    if (!document.fullscreenElement) {
        deckDependenciesContainer.requestFullscreen().then(() => {
            // Update icon to exit fullscreen
            if (fullscreenIcon) {
                fullscreenIcon.innerHTML = '<path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>';
            }
        }).catch(err => {
            console.error('Error entering fullscreen:', err);
        });
    } else {
        document.exitFullscreen();
    }
}

// Listen for fullscreen changes to update icons
document.addEventListener('fullscreenchange', () => {
    const homescreenIcon = document.getElementById('homescreen-fullscreen-icon');
    const deckIcon = document.getElementById('deck-fullscreen-icon');

    if (!document.fullscreenElement) {
        // Restore expand icons
        if (homescreenIcon) {
            homescreenIcon.innerHTML = '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>';
        }
        if (deckIcon) {
            deckIcon.innerHTML = '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>';
        }
    }
});

// Keyboard navigation
document.addEventListener('keydown', function(e) {
    const learnView = document.getElementById('learn-view');
    const testView = document.getElementById('test-view');
    const lineageView = document.getElementById('lineage-view');

    if (!learnView.classList.contains('hidden')) {
        if (e.key === 'ArrowLeft') {
            prevCard();
        } else if (e.key === 'ArrowRight') {
            nextCard();
        } else if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            const flashcard = document.querySelector('.flashcard');
            flipCard(flashcard);
        }
    } else if (!testView.classList.contains('hidden')) {
        if (e.key === 'ArrowLeft') {
            prevQuestion();
        } else if (e.key === 'ArrowRight') {
            nextQuestion();
        }
    } else if (!lineageView.classList.contains('hidden')) {
        if (e.key === 'Escape') {
            closeLineageView();
        }
    }
});
