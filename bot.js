const { Telegraf, Markup } = require("telegraf");

const bot = new Telegraf(process.env.BOT_TOKEN || "7473136514:AAHo9JfF8Be1qLmbrCiopjT5WhpWxBQABCU);

const games = {}; // Structure: games[chatId][gameId] = game object

function createEmptyBoard() {
  return ["", "", "", "", "", "", "", "", ""];
}

function generateBoardMessage(board) {
  const keyboard = [];
  for (let i = 0; i < 3; i++) {
    const row = [];
    for (let j = 0; j < 3; j++) {
      const index = i * 3 + j;
      row.push(
        Markup.button.callback(board[index] || "⬜", `move_${index}`)
      );
    }
    keyboard.push(row);
  }
  return Markup.inlineKeyboard(keyboard);
}

function checkWinner(board, player) {
  const wins = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  return wins.some((combo) =>
    combo.every((i) => board[i] === player)
  );
}

function isDraw(board) {
  return board.every((cell) => cell !== "");
}

// /start command
bot.start((ctx) => {
  ctx.replyWithHTML(`<b>Welcome to Tic Tac Toe Bot!</b>\nUse /tictactoe in a group to play with friends.`);
});

// /tictactoe command
bot.command("tictactoe", (ctx) => {
  const chatId = ctx.chat.id.toString();
  if (ctx.chat.type === "private") {
    return ctx.reply("Please use this command in a group.");
  }

  const playerX = ctx.from;
  const gameId = `${playerX.id}_${Date.now()}`;

  if (!games[chatId]) games[chatId] = {};
  games[chatId][gameId] = {
    board: createEmptyBoard(),
    players: { X: playerX, O: null },
    currentTurn: "X",
  };

  ctx.replyWithHTML(
    `<b>${playerX.first_name}</b> started a game of Tic Tac Toe!\nWaiting for another player to <b>join</b>...`,
    Markup.inlineKeyboard([
      [Markup.button.callback("Join Game", `join_${chatId}_${gameId}`)],
    ])
  );
});

// Handle join game
bot.action(/join_(.+)_(.+)/, async (ctx) => {
  const [, chatIdRaw, gameId] = ctx.match;
  const chatId = chatIdRaw.toString();
  const playerO = ctx.from;

  const game = games[chatId]?.[gameId];
  if (!game) return ctx.answerCbQuery("Game not found.");

  if (game.players.O) return ctx.answerCbQuery("Game already joined.");
  if (game.players.X.id === playerO.id)
    return ctx.answerCbQuery("You can't join your own game.");

  game.players.O = playerO;

  await ctx.editMessageText(
    `<b>Tic Tac Toe Game Started!</b>\n<b>${game.players.X.first_name} (X)</b> vs <b>${game.players.O.first_name} (O)</b>\n\n<b>${game.players.X.first_name}'s</b> turn.`,
    {
      parse_mode: "HTML",
      ...generateBoardMessage(game.board).reply_markup,
    }
  );
});

// Handle game moves
bot.on("callback_query", async (ctx) => {
  const data = ctx.callbackQuery.data;

  if (data.startsWith("move_")) {
    const index = parseInt(data.split("_")[1]);
    const chatId = ctx.chat?.id?.toString() || ctx.callbackQuery.message.chat.id.toString();

    const messageId = ctx.callbackQuery.message.message_id;

    const gameEntries = Object.entries(games[chatId] || {});
    let gameId, game;
    for (const [id, g] of gameEntries) {
      if (g.messageId === messageId) {
        gameId = id;
        game = g;
        break;
      }
    }

    if (!game) {
      // fallback if messageId not matched, take first active game
      [gameId, game] = gameEntries[0] || [];
      if (!game) return ctx.answerCbQuery("Game not found.");
    }

    const playerId = ctx.from.id;
    const playerSymbol = game.players.X.id === playerId ? "X" :
                         game.players.O?.id === playerId ? "O" : null;

    if (!playerSymbol) return ctx.answerCbQuery("You're not part of this game.");
    if (game.currentTurn !== playerSymbol) return ctx.answerCbQuery("Not your turn.");
    if (game.board[index] !== "") return ctx.answerCbQuery("Cell already taken.");

    game.board[index] = playerSymbol;

    if (checkWinner(game.board, playerSymbol)) {
      await ctx.editMessageText(
        `<b>${game.players[playerSymbol].first_name} (${playerSymbol}) wins!</b>`,
        { parse_mode: "HTML" }
      );
      delete games[chatId][gameId];
      return;
    }

    if (isDraw(game.board)) {
      await ctx.editMessageText(`<b>It's a draw!</b>`, { parse_mode: "HTML" });
      delete games[chatId][gameId];
      return;
    }

    game.currentTurn = playerSymbol === "X" ? "O" : "X";

    await ctx.editMessageText(
      `<b>${game.players.X.first_name} (X)</b> vs <b>${game.players.O.first_name} (O)</b>\n\n<b>${game.players[game.currentTurn].first_name}'s</b> turn.`,
      {
        parse_mode: "HTML",
        ...generateBoardMessage(game.board).reply_markup,
      }
    );

    ctx.answerCbQuery();
  }
});

// Server for Render
const express = require("express");
const app = express();
app.get("/", (req, res) => {
  res.send("Tic Tac Toe Telegram Bot is running.");
});
app.listen(process.env.PORT || 3000, () => {
  console.log("Bot is running...");
  bot.launch();
});
