const { Telegraf, Markup } = require('telegraf');
const express = require('express');

const TOKEN = '7473136514:AAHo9JfF8Be1qLmbrCiopjT5WhpWxBQABCU';
const bot = new Telegraf(TOKEN);

// Express server for Render
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Tic Tac Toe Bot Running'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Games data structure: chatId => { gameId => game }
const games = {};

function initGame(chatId, player1Id) {
    const chatKey = String(chatId);
    if (!games[chatKey]) games[chatKey] = {};
    const gameId = `game_${Date.now()}_${player1Id}`; // More unique ID with timestamp
    games[chatKey][gameId] = {
        board: Array(9).fill(""),
        players: [player1Id],
        names: {},
        turn: 0,
        messageId: null,
        createdAt: Date.now()
    };
    return gameId;
}

function getSymbol(turn) {
    return turn === 0 ? "X" : "O";
}

function generateBoardMarkup(board, chatId, gameId) {
    return Markup.inlineKeyboard([
        [0, 1, 2].map(i => Markup.button.callback(board[i] || " ", `move_${chatId}_${gameId}_${i}`)),
        [3, 4, 5].map(i => Markup.button.callback(board[i] || " ", `move_${chatId}_${gameId}_${i}`)),
        [6, 7, 8].map(i => Markup.button.callback(board[i] || " ", `move_${chatId}_${gameId}_${i}`))
    ]);
}

function checkWinner(board, player) {
    const wins = [
        [0,1,2], [3,4,5], [6,7,8],
        [0,3,6], [1,4,7], [2,5,8],
        [0,4,8], [2,4,6]
    ];
    return wins.some(combo => combo.every(i => board[i] === player));
}

function isDraw(board) {
    return board.every(cell => cell !== "");
}

bot.start(ctx => {
    const name = ctx.from.first_name;
    ctx.replyWithHTML(
        `<b>Welcome ${name}!</b>\n\n` +
        `This is a 2-player <b>Tic Tac Toe</b> bot.\n\n` +
        `Use <code>/tictactoe</code> in a <b>group</b> to start a game.`
    );
});

bot.command("tictactoe", async ctx => {
    const chat = ctx.chat;
    const user = ctx.from;

    if (chat.type === "private") {
        return ctx.reply("❌ This command only works in groups!");
    }

    const chatId = chat.id;
    const userId = user.id;
    const chatKey = String(chatId);

    // Clear any existing waiting games for this user
    if (games[chatKey]) {
        Object.keys(games[chatKey]).forEach(id => {
            if (games[chatKey][id].players[0] === userId && id.startsWith("game_")) {
                delete games[chatKey][id];
            }
        });
    }

    const gameId = initGame(chatId, userId);
    games[chatKey][gameId].names[userId] = user.first_name;

    const message = await ctx.replyWithHTML(
        `<b>Game Created!</b>\n\n` +
        `Player <b>X</b>: ${user.first_name}\n\n` +
        `Waiting for <b>Player O</b> to join...`,
        Markup.inlineKeyboard([[Markup.button.callback("▶️ Join Game", `join_${chatId}_${gameId}`)]])
    );

    // Store the message ID for later reference
    games[chatKey][gameId].messageId = message.message_id;
});

// Handle join
bot.action(/^join_(.+)_(.+)/, async ctx => {
    const [chatIdRaw, gameId] = ctx.match.slice(1);
    const chatId = String(chatIdRaw);
    const user = ctx.from;
    const userId = user.id;
    const chatKey = String(chatId);

    const game = games[chatKey]?.[gameId];
    
    if (!game) {
        try {
            await ctx.answerCbQuery("Game not found or expired.");
            await ctx.deleteMessage();
        } catch (e) {
            console.log("Couldn't delete message:", e.message);
        }
        return;
    }
    
    if (game.players.includes(userId)) {
        await ctx.answerCbQuery("You already joined.");
        return;
    }
    
    if (game.players.length >= 2) {
        await ctx.answerCbQuery("Game is already full.");
        return;
    }

    // Add second player
    game.players.push(userId);
    game.names[userId] = user.first_name;
    game.turn = 0; // Reset to first player's turn

    const [p1, p2] = game.players;
    const nameX = game.names[p1];
    const nameO = game.names[p2];

    try {
        // Delete the join message
        await ctx.deleteMessage();
        
        // Send the game board
        const message = await ctx.telegram.sendMessage(
            chatId,
            `<b>Game Started!</b>\n\n` +
            `Player <b>X</b>: ${nameX}\n` +
            `Player <b>O</b>: ${nameO}\n\n` +
            `It's <b>${nameX}</b>'s turn (X)`,
            {
                parse_mode: "HTML",
                reply_markup: generateBoardMarkup(game.board, chatId, gameId).reply_markup
            }
        );
        
        // Store the game board message ID
        game.messageId = message.message_id;
        
        await ctx.answerCbQuery("You joined the game!");
    } catch (e) {
        console.log("Error sending game board:", e.message);
        delete games[chatKey][gameId];
        await ctx.answerCbQuery("Error starting game. Please try again.");
    }
});

// Handle moves
bot.action(/^move_(.+)_(.+)_(\d+)/, async ctx => {
    const [chatIdRaw, gameId, cellIndexRaw] = ctx.match.slice(1);
    const chatId = String(chatIdRaw);
    const cellIndex = parseInt(cellIndexRaw);
    const userId = ctx.from.id;
    const chatKey = String(chatId);

    const game = games[chatKey]?.[gameId];
    if (!game) {
        try {
            await ctx.answerCbQuery("Game not found or expired.");
            await ctx.deleteMessage();
        } catch (e) {
            console.log("Couldn't delete message:", e.message);
        }
        return;
    }

    if (userId !== game.players[game.turn]) {
        await ctx.answerCbQuery("Not your turn!");
        return;
    }
    
    if (game.board[cellIndex] !== "") {
        await ctx.answerCbQuery("Already taken!");
        return;
    }

    const symbol = getSymbol(game.turn);
    game.board[cellIndex] = symbol;

    // Check for winner or draw
    if (checkWinner(game.board, symbol)) {
        try {
            await ctx.editMessageText(
                `<b>🎉 Player ${symbol} (${game.names[userId]}) wins!</b>\n\n` +
                `Player <b>X</b>: ${game.names[game.players[0]]}\n` +
                `Player <b>O</b>: ${game.names[game.players[1]]}`,
                { 
                    parse_mode: "HTML",
                    reply_markup: generateBoardMarkup(game.board, chatId, gameId).reply_markup
                }
            );
            delete games[chatKey][gameId];
            await ctx.answerCbQuery(`Player ${symbol} wins!`);
        } catch (e) {
            console.log("Error updating win message:", e.message);
        }
        return;
    }

    if (isDraw(game.board)) {
        try {
            await ctx.editMessageText(
                `<b>🤝 It's a draw!</b>\n\n` +
                `Player <b>X</b>: ${game.names[game.players[0]]}\n` +
                `Player <b>O</b>: ${game.names[game.players[1]]}`,
                { 
                    parse_mode: "HTML",
                    reply_markup: generateBoardMarkup(game.board, chatId, gameId).reply_markup
                }
            );
            delete games[chatKey][gameId];
            await ctx.answerCbQuery("Game ended in a draw!");
        } catch (e) {
            console.log("Error updating draw message:", e.message);
        }
        return;
    }

    // Switch turns
    game.turn = 1 - game.turn;
    const nextPlayerId = game.players[game.turn];
    const nextName = game.names[nextPlayerId];
    const nextSymbol = getSymbol(game.turn);

    try {
        await ctx.editMessageText(
            `It's <b>${nextName}</b>'s turn (${nextSymbol})\n\n` +
            `Player <b>X</b>: ${game.names[game.players[0]]}\n` +
            `Player <b>O</b>: ${game.names[game.players[1]]}`,
            {
                parse_mode: "HTML",
                reply_markup: generateBoardMarkup(game.board, chatId, gameId).reply_markup
            }
        );
        await ctx.answerCbQuery(`You placed ${symbol}`);
    } catch (e) {
        console.log("Error updating game board:", e.message);
        await ctx.answerCbQuery("Error updating game. Please try again.");
    }
});

// Clean up expired games periodically (30 minutes)
setInterval(() => {
    const now = Date.now();
    for (const chatId in games) {
        for (const gameId in games[chatId]) {
            const game = games[chatId][gameId];
            // Remove games older than 30 minutes
            if (now - game.createdAt > 30 * 60 * 1000) {
                delete games[chatId][gameId];
            }
        }
        // If no games left in chat, remove the chat entry
        if (Object.keys(games[chatId]).length === 0) {
            delete games[chatId];
        }
    }
}, 5 * 60 * 1000); // Check every 5 minutes

bot.launch();
