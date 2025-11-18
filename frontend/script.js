document.addEventListener('DOMContentLoaded', () => {
    const chatForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('message-input');
    const messageList = document.getElementById('message-list');
    const chatContainer = document.getElementById('chat-container');
    const sendButton = document.getElementById('send-button');

    // The conversation history is stored in this array.
    // We don't include the initial system message here.
    let conversationHistory = [];

    // --- Auto-resize textarea ---
    messageInput.addEventListener('input', () => {
        messageInput.style.height = 'auto';
        messageInput.style.height = `${messageInput.scrollHeight}px`;
        // Disable send button if input is empty
        sendButton.disabled = messageInput.value.trim() === '';
    });

    // --- Handle form submission ---
    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const messageText = messageInput.value.trim();
        if (messageText) {
            sendMessage(messageText);
        }
    });
    
    // --- Allow sending with Enter key ---
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            chatForm.dispatchEvent(new Event('submit'));
        }
    });

    // --- Main function to send a message ---
    async function sendMessage(messageText) {
        // Add user message to UI and history
        addMessageToUI(messageText, 'user');
        conversationHistory.push({ role: 'user', content: messageText });

        // Clear input and show loading state
        messageInput.value = '';
        messageInput.style.height = 'auto';
        sendButton.disabled = true;
        const loadingIndicator = addMessageToUI('', 'assistant', true);

        try {
            const response = await fetch('http://localhost:3000/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: messageText,
                    history: conversationHistory.slice(0, -1) // Send history *before* the current message
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'API request failed');
            }

            const data = await response.json();
            const assistantReply = data.reply;

            // Add assistant reply to history
            conversationHistory.push({ role: 'assistant', content: assistantReply });

            // Update UI with the actual reply
            updateAssistantMessage(loadingIndicator, assistantReply);

        } catch (error) {
            console.error('Error:', error);
            updateAssistantMessage(loadingIndicator, `Sorry, I ran into an error: ${error.message}`);
        } finally {
            sendButton.disabled = false;
        }
    }

    // --- Helper to add a message to the UI ---
    function addMessageToUI(text, role, isLoading = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}`;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        if (isLoading) {
            contentDiv.innerHTML = '<div class="flex items-center gap-2"><div class="w-2 h-2 bg-zinc-500 rounded-full animate-pulse"></div><div class="w-2 h-2 bg-zinc-500 rounded-full animate-pulse [animation-delay:0.2s]"></div><div class="w-2 h-2 bg-zinc-500 rounded-full animate-pulse [animation-delay:0.4s]"></div></div>';
        } else {
            // A simple way to render newlines
            contentDiv.innerText = text;
        }
        
        messageDiv.appendChild(contentDiv);
        messageList.appendChild(messageDiv);

        // Scroll to the bottom
        chatContainer.scrollTop = chatContainer.scrollHeight;
        return contentDiv;
    }

    // --- Helper to update a message (used for loading -> final reply) ---
    function updateAssistantMessage(element, newText) {
        element.innerHTML = ''; // Clear loading dots
        element.innerText = newText;
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    // --- Agent options logic ---
    const agentButtons = document.querySelectorAll('.agent-option');
    agentButtons.forEach(button => {
        button.addEventListener('click', () => {
            agentButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            // You can add logic here to change the bot's behavior based on the selected agent
        });
    });
});