const { Telegraf, Markup } = require("telegraf");

const bot = new Telegraf("7473136514:AAHo9JfF8Be1qLmbrCiopjT5WhpWxBQABCU");

const games = {};
const symbols = ["X", "O"];

function createEmptyBoard() {
  return Array(9).fill(" ");
}

function getSymbol(turn) {
  return symbols[turn % 2];
}

function checkWinner(board) {
  const winPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];
  for (const [a, b, c] of winPatterns) {
    if (board[a] !== " " && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return null;
}

function isDraw(board) {
  return board.every(cell => cell !== " ");
}

function generateBoardMarkup(board) {
  const buttons = [];
  for (let i = 0; i < 3; i++) {
    const row = [];
    for (let j = 0; j < 3; j++) {
      const index = i * 3 + j;
      row.push(Markup.button.callback(board[index], `move_${index}`));
    }
    buttons.push(row);
  }
  return Markup.inlineKeyboard(buttons);
}

bot.start((ctx) => {
  ctx.reply(
    `<b>Welcome to Tic Tac Toe Bot!</b>\n\nUse <code>/tictactoe</code> in a group to start a game.`,
    { parse_mode: "HTML" }
  );
});

bot.command("tictactoe", async (ctx) => {
  if (ctx.chat.type === "private") {
    return ctx.reply("Please use this command in a group.");
  }

  const chatId = ctx.chat.id;
  const userId = ctx.from.id;
  const name = ctx.from.first_name;

  if (games[chatId]) {
    return ctx.reply("A game is already in progress.");
  }

  games[chatId] = {
    board: createEmptyBoard(),
    players: [userId],
    names: { [userId]: name },
    turn: 0,
    messageId: null,
    joined: false
  };

  const joinBtn = Markup.inlineKeyboard([
    Markup.button.callback("Join Game", "join_game")
  ]);

  const message = await ctx.reply(
    `<b>${name}</b> started a new game!\n\nWaiting for a second player to join...`,
    {
      reply_markup: joinBtn.reply_markup,
      parse_mode: "HTML"
    }
  );

  games[chatId].messageId = message.message_id;
});

bot.action("join_game", async (ctx) => {
  const chatId = ctx.chat.id;
  const userId = ctx.from.id;
  const name = ctx.from.first_name;
  const game = games[chatId];

  if (!game || game.players.length >= 2 || game.joined) {
    return ctx.answerCbQuery("You cannot join this game.");
  }

  if (game.players.includes(userId)) {
    return ctx.answerCbQuery("You already joined the game.");
  }

  game.players.push(userId);
  game.names[userId] = name;
  game.joined = true;

  const [playerX, playerO] = game.players.map(id => game.names[id]);
  const symbolX = symbols[0];

  await ctx.editMessageText(
    `<b>Game Started!</b>\n\n<b>Player X:</b> ${playerX}\n<b>Player O:</b> ${playerO}\n\n<i>${playerX}'s turn (${symbolX})</i>`,
    {
      reply_markup: generateBoardMarkup(game.board).reply_markup,
      parse_mode: "HTML"
    }
  );
});

bot.action(/move_(\d+)/, async (ctx) => {
  const chatId = ctx.chat.id;
  const userId = ctx.from.id;
  const game = games[chatId];

  if (!game || !game.joined || game.players.length < 2) {
    return ctx.answerCbQuery("No active game.");
  }

  const index = parseInt(ctx.match[1]);
  if (game.board[index] !== " ") {
    return ctx.answerCbQuery("That spot is already taken.");
  }

  const currentPlayerId = game.players[game.turn % 2];
  if (userId !== currentPlayerId) {
    return ctx.answerCbQuery("It's not your turn.");
  }

  const symbol = getSymbol(game.turn);
  game.board[index] = symbol;
  game.turn++;

  const winner = checkWinner(game.board);
  const nextPlayerId = game.players[game.turn % 2];

  if (winner) {
    await ctx.editMessageText(
      `<b>Player ${symbol} (${game.names[userId]}) wins!</b>`,
      { parse_mode: "HTML" }
    );
    delete games[chatId];
    return;
  }

  if (isDraw(game.board)) {
    await ctx.editMessageText(`<b>It's a draw!</b>`, { parse_mode: "HTML" });
    delete games[chatId];
    return;
  }

  await ctx.editMessageText(
    `<i>It's ${game.names[nextPlayerId]}'s turn (${getSymbol(game.turn)})</i>`,
    {
      reply_markup: generateBoardMarkup(game.board).reply_markup,
      parse_mode: "HTML"
    }
  );
});

bot.launch();
