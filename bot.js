const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

// Game storage
const activeGames = new Map(); // gameId -> game
const chatGames = new Map();   // chatId -> Set of gameIds

class TicTacToe {
    constructor(chatId, creator) {
        this.gameId = uuidv4();
        this.chatId = chatId;
        this.creator = creator;
        this.board = Array(9).fill(null);
        this.players = [];
        this.currentPlayerIndex = 0;
        this.gameStatus = 'waiting'; // waiting, playing, finished
        this.winner = null;
    }

    addPlayer(user) {
        if (this.players.length >= 2) return false;
        if (this.players.some(p => p.id === user.id)) return false;
        
        this.players.push(user);
        if (this.players.length === 2) {
            this.gameStatus = 'playing';
        }
        return true;
    }

    makeMove(position, playerId) {
        if (this.gameStatus !== 'playing') return false;
        if (this.players[this.currentPlayerIndex].id !== playerId) return false;
        if (this.board[position] !== null) return false;
        
        this.board[position] = this.currentPlayerIndex === 0 ? 'X' : 'O';
        
        if (this.checkWinner()) {
            this.gameStatus = 'finished';
            this.winner = this.players[this.currentPlayerIndex];
            return true;
        }
        
        if (this.board.every(cell => cell !== null)) {
            this.gameStatus = 'finished';
            return true;
        }
        
        this.currentPlayerIndex = 1 - this.currentPlayerIndex;
        return true;
    }

    checkWinner() {
        const winPatterns = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
            [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
            [0, 4, 8], [2, 4, 6]             // diagonals
        ];

        return winPatterns.some(pattern => {
            const [a, b, c] = pattern;
            return this.board[a] !== null && 
                   this.board[a] === this.board[b] && 
                   this.board[a] === this.board[c];
        });
    }

    getCurrentPlayer() {
        return this.players[this.currentPlayerIndex];
    }
}

// Helper functions
async function sendMessage(chatId, text, replyMarkup = null) {
    try {
        await axios.post(`${TELEGRAM_API}/sendMessage`, {
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
            reply_markup: replyMarkup
        });
    } catch (error) {
        console.error('Error sending message:', error.message);
    }
}

function formatBoard(board) {
    const symbols = board.map(cell => cell === null ? ' ' : cell);
    return `
${symbols[0]} | ${symbols[1]} | ${symbols[2]}
---------
${symbols[3]} | ${symbols[4]} | ${symbols[5]}
---------
${symbols[6]} | ${symbols[7]} | ${symbols[8]}
`;
}

function getActiveGamesList(chatId) {
    const gamesList = Array.from(chatGames.get(chatId) || [])
        .map(gameId => activeGames.get(gameId))
        .filter(game => game.gameStatus === 'waiting');
    
    if (gamesList.length === 0) return null;
    
    return gamesList.map(game => ({
        text: `Join ${game.creator.first_name}'s game`,
        callback_data: `join_${game.gameId}`
    }));
}

// Command handlers
async function handleStart(chatId, from) {
    await sendMessage(chatId, `🎮 <b>Multi-Game Tic Tac Toe Bot</b> 🎮\n\n` +
        `Now you can have multiple Tic Tac Toe games running simultaneously in this group!\n\n` +
        `Use /tictactoe to start a new game\n` +
        `Use /games to see active games waiting for players`);
}

async function handleTicTacToe(chatId, from) {
    const game = new TicTacToe(chatId, from);
    activeGames.set(game.gameId, game);
    
    if (!chatGames.has(chatId)) {
        chatGames.set(chatId, new Set());
    }
    chatGames.get(chatId).add(game.gameId);
    
    await sendMessage(chatId, 
        `🎮 <b>New Tic Tac Toe Game Created by ${from.first_name}</b> 🎮\n\n` +
        `Game ID: <code>${game.gameId.substring(0, 8)}</code>\n` +
        `Waiting for a second player to join...`, {
        inline_keyboard: [[
            { text: 'Join This Game', callback_data: `join_${game.gameId}` }
        ]]
    });
}

async function handleActiveGames(chatId) {
    const gamesButtons = getActiveGamesList(chatId);
    
    if (!gamesButtons || gamesButtons.length === 0) {
        await sendMessage(chatId, 'No active games waiting for players. Use /tictactoe to start one!');
        return;
    }
    
    const chunks = [];
    for (let i = 0; i < gamesButtons.length; i += 2) {
        chunks.push(gamesButtons.slice(i, i + 2));
    }
    
    await sendMessage(chatId, '🎮 <b>Active Games Waiting for Players:</b>', {
        inline_keyboard: chunks
    });
}

// Callback handlers
async function handleJoinGame(chatId, from, gameId) {
    const game = activeGames.get(gameId);
    
    if (!game) {
        await sendMessage(chatId, 'This game no longer exists.');
        return;
    }
    
    if (game.addPlayer(from)) {
        if (game.players.length === 2) {
            await sendMessage(game.chatId, 
                `🎮 <b>Game Started!</b> 🎮\n` +
                `Game ID: <code>${game.gameId.substring(0, 8)}</code>\n\n` +
                `Player 1: ${game.players[0].first_name} (X)\n` +
                `Player 2: ${game.players[1].first_name} (O)\n\n` +
                `It's ${game.players[0].first_name}'s turn!`);
            
            await sendGameBoard(game);
        } else {
            await sendMessage(game.chatId, 
                `${from.first_name} has joined the game!\n` +
                `Game ID: <code>${game.gameId.substring(0, 8)}</code>\n` +
                `Waiting for one more player...`, {
                inline_keyboard: [[
                    { text: 'Join This Game', callback_data: `join_${game.gameId}` }
                ]]
            });
        }
    } else {
        await sendMessage(chatId, 'You cannot join this game (already full or you\'re already in it).');
    }
}

async function handleMove(chatId, from, gameId, position) {
    const game = activeGames.get(gameId);
    
    if (!game || game.gameStatus !== 'playing') {
        await sendMessage(chatId, 'This game is not active.');
        return;
    }
    
    if (game.makeMove(parseInt(position), from.id)) {
        if (game.gameStatus === 'finished') {
            let message = `🎮 <b>Game Finished!</b> 🎮\n` +
                         `Game ID: <code>${game.gameId.substring(0, 8)}</code>\n\n`;
            
            if (game.winner) {
                message += `🎉 <b>${game.winner.first_name} wins!</b> 🎉\n\n`;
            } else {
                message += `🤝 <b>It's a draw!</b> 🤝\n\n`;
            }
            
            message += formatBoard(game.board);
            
            await sendMessage(game.chatId, message);
            
            // Clean up
            activeGames.delete(game.gameId);
            if (chatGames.has(game.chatId)) {
                chatGames.get(game.chatId).delete(game.gameId);
                if (chatGames.get(game.chatId).size === 0) {
                    chatGames.delete(game.chatId);
                }
            }
        } else {
            await sendMessage(game.chatId, 
                `Game ID: <code>${game.gameId.substring(0, 8)}</code>\n` +
                `${game.getCurrentPlayer().first_name}'s turn (${game.currentPlayerIndex === 0 ? 'X' : 'O'})`);
            await sendGameBoard(game);
        }
    } else {
        await sendMessage(chatId, 'Invalid move!');
    }
}

async function sendGameBoard(game) {
    const boardButtons = [];
    
    for (let i = 0; i < 9; i += 3) {
        const row = [];
        for (let j = 0; j < 3; j++) {
            const pos = i + j;
            const cell = game.board[pos];
            row.push({
                text: cell || ' ',
                callback_data: cell ? `invalid_${game.gameId}` : `move_${game.gameId}_${pos}`
            });
        }
        boardButtons.push(row);
    }
    
    await sendMessage(game.chatId, formatBoard(game.board), {
        inline_keyboard: boardButtons
    });
}

// Webhook handler
app.post('/webhook', async (req, res) => {
    const { message, callback_query } = req.body;
    
    try {
        if (message) {
            const chatId = message.chat.id;
            const from = message.from;
            const text = message.text || '';
            
            if (text.startsWith('/start')) {
                await handleStart(chatId, from);
            } else if (text.startsWith('/tictactoe')) {
                await handleTicTacToe(chatId, from);
            } else if (text.startsWith('/games')) {
                await handleActiveGames(chatId);
            }
        } else if (callback_query) {
            const chatId = callback_query.message.chat.id;
            const from = callback_query.from;
            const data = callback_query.data;
            
            if (data.startsWith('join_')) {
                const gameId = data.split('_')[1];
                await handleJoinGame(chatId, from, gameId);
            } else if (data.startsWith('move_')) {
                const [_, gameId, position] = data.split('_');
                await handleMove(chatId, from, gameId, position);
            }
        }
    } catch (error) {
        console.error('Error handling update:', error);
    }
    
    res.sendStatus(200);
});

// Set webhook
async function setWebhook() {
    try {
        const webhookUrl = process.env.WEBHOOK_URL;
        const response = await axios.get(`${TELEGRAM_API}/setWebhook?url=${webhookUrl}/webhook`);
        console.log('Webhook set:', response.data);
    } catch (error) {
        console.error('Error setting webhook:', error.message);
    }
}

// Start server
app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    if (TELEGRAM_TOKEN && process.env.WEBHOOK_URL) {
        await setWebhook();
    }
});
