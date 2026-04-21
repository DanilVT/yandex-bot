const userStates = new Map();

const USERS = {
  "danil@panelgroup.ru": {
    queue: "DANILVITT",
    assignee: "danil",
    tag: "from_bot_personal"
  },
  "timothy@panelgroup.ru": {
    queue: "TIMOFEICHETIN",
    assignee: "timothy",
    tag: "from_bot_personal"
  },
  "daria@panelgroup.ru": {
    queue: "DARIAISAEVA",
    assignee: "daria",
    tag: "from_bot_personal"
  }
};

const TEMPLATE_FILES = {
  card: {
    url: "https://yandex-bot.vercel.app/templates/cartochka.docx",
    filename: "Карточка.docx"
  },
  specification: {
    url: "https://yandex-bot.vercel.app/templates/specification.docx",
    filename: "Спецификация.docx"
  }
};

async function sendBotMessage(login, text, menu = "main") {
  const body = {
    login,
    text
  };

  if (menu === "main") {
    body.suggest_buttons = {
      layout: "true",
      persist: true,
      buttons: [
        [
          {
            id: "personal-task-btn",
            title: "Трекер: личная задача",
            directives: [
              {
                type: "server_action",
                name: "create_personal_task",
                payload: { mode: "personal_task" }
              }
            ]
          }
        ],
        [
          {
            id: "templates-btn",
            title: "Шаблоны",
            directives: [
              {
                type: "server_action",
                name: "open_templates",
                payload: { mode: "templates" }
              }
            ]
          }
        ]
      ]
    };
  }

  if (menu === "templates") {
    body.suggest_buttons = {
      layout: "true",
      persist: true,
      buttons: [
        [
          {
            id: "template-card-btn",
            title: "Карточка",
            directives: [
              {
                type: "server_action",
                name: "send_template_card",
                payload: { template: "card" }
              }
            ]
          }
        ],
        [
          {
            id: "template-specification-btn",
            title: "Спецификация",
            directives: [
              {
                type: "server_action",
                name: "send_template_specification",
                payload: { template: "specification" }
              }
            ]
          }
        ],
        [
          {
            id: "back-to-main-btn",
            title: "Назад",
            directives: [
              {
                type: "server_action",
                name: "back_to_main_menu",
                payload: { mode: "main" }
              }
            ]
          }
        ]
      ]
    };
  }

  const response = await fetch(
    "https://botapi.messenger.yandex.net/bot/v1/messages/sendText/",
    {
      method: "POST",
      headers: {
        "Authorization": `OAuth ${process.env.BOT_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }
  );

  const resultText = await response.text();
  console.log("MESSENGER RESPONSE:", response.status, resultText);

  return {
    ok: response.ok,
    status: response.status,
    raw: resultText
  };
}

async function sendBotFile(login, fileUrl, filename) {
  const fileResponse = await fetch(fileUrl);

  if (!fileResponse.ok) {
    console.log("FILE DOWNLOAD ERROR:", fileResponse.status);
    return {
      ok: false,
      status: fileResponse.status
    };
  }

  const buffer = await fileResponse.arrayBuffer();

  const formData = new FormData();
  formData.append("login", login);
  formData.append(
    "file",
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    }),
    filename
  );

  const response = await fetch(
    "https://botapi.messenger.yandex.net/bot/v1/messages/sendFile/",
    {
      method: "POST",
      headers: {
        "Authorization": `OAuth ${process.env.BOT_TOKEN}`
      },
      body: formData
    }
  );

  const resultText = await response.text();
  console.log("SEND FILE RESULT:", response.status, resultText);

  return {
    ok: response.ok,
    status: response.status,
    raw: resultText
  };
}

async function createTrackerIssue(summary, description, login) {
  const user = USERS[login];

  if (!user) {
    return {
      ok: false,
      status: 400,
      data: null,
      raw: "Пользователь не настроен"
    };
  }

  const response = await fetch(
    "https://api.tracker.yandex.net/v3/issues/",
    {
      method: "POST",
      headers: {
        "Authorization": `OAuth ${process.env.OAUTH_TOKEN}`,
        "X-Org-ID": process.env.ORG_ID,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        summary,
        description,
        queue: user.queue,
        assignee: user.assignee,
        tags: [user.tag]
      })
    }
  );

  const resultText = await response.text();
  console.log("TRACKER RESPONSE:", response.status, resultText);

  let resultJson = null;
  try {
    resultJson = JSON.parse(resultText);
  } catch (_) {}

  return {
    ok: response.ok,
    status: response.status,
    data: resultJson,
    raw: resultText
  };
}

export default async function handler(req, res) {
  try {
    const data = req.body;
    console.log("UPDATE:", JSON.stringify(data));

    const update = data?.updates?.[0];
    if (!update) {
      return res.status(200).end();
    }

    const login = update?.from?.login;
    if (!login) {
      return res.status(200).end();
    }

    const user = USERS[login];
    const serverActionName = update?.bot_request?.server_action?.name;
    const text = (update?.text || "").trim();

    if (serverActionName === "create_personal_task") {
      if (!user) {
        await sendBotMessage(
          login,
          "Ты пока не настроен в боте. Обратись к администратору.",
          "main"
        );
        return res.status(200).end();
      }

      userStates.set(login, {
        step: "awaiting_summary"
      });

      await sendBotMessage(
        login,
        "Напиши название задачи одним сообщением",
        "none"
      );

      return res.status(200).end();
    }

    if (serverActionName === "open_templates") {
      await sendBotMessage(
        login,
        "Выбери нужный шаблон",
        "templates"
      );
      return res.status(200).end();
    }

    if (serverActionName === "back_to_main_menu") {
      await sendBotMessage(
        login,
        "Главное меню",
        "main"
      );
      return res.status(200).end();
    }

    if (serverActionName === "send_template_card") {
      try {
        const file = TEMPLATE_FILES.card;
        const result = await sendBotFile(login, file.url, file.filename);

        if (!result.ok) {
          await sendBotMessage(
            login,
            `Не удалось отправить файл. Код: ${result.status}`,
            "templates"
          );
        } else {
          await sendBotMessage(
            login,
            "Файл отправлен",
            "templates"
          );
        }
      } catch (error) {
        console.log("SEND FILE ERROR:", error?.message || error);
        await sendBotMessage(
          login,
          "Не удалось отправить файл",
          "templates"
        );
      }

      return res.status(200).end();
    }

    if (serverActionName === "send_template_specification") {
      try {
        const file = TEMPLATE_FILES.specification;
        const result = await sendBotFile(login, file.url, file.filename);

        if (!result.ok) {
          await sendBotMessage(
            login,
            `Не удалось отправить файл. Код: ${result.status}`,
            "templates"
          );
        } else {
          await sendBotMessage(
            login,
            "Файл отправлен",
            "templates"
          );
        }
      } catch (error) {
        console.log("SEND FILE ERROR:", error?.message || error);
        await sendBotMessage(
          login,
          "Не удалось отправить файл",
          "templates"
        );
      }

      return res.status(200).end();
    }

    if (!text) {
      await sendBotMessage(
        login,
        "Нажми кнопку ниже",
        "main"
      );
      return res.status(200).end();
    }

    const currentState = userStates.get(login);

    if (!currentState) {
      await sendBotMessage(
        login,
        "Нажми кнопку ниже",
        "main"
      );
      return res.status(200).end();
    }

    if (!user) {
      userStates.delete(login);

      await sendBotMessage(
        login,
        "Ты пока не настроен в боте. Обратись к администратору.",
        "main"
      );
      return res.status(200).end();
    }

    if (currentState.step === "awaiting_summary") {
      userStates.set(login, {
        step: "awaiting_description",
        summary: text
      });

      await sendBotMessage(
        login,
        "Теперь напиши описание задачи одним сообщением",
        "none"
      );

      return res.status(200).end();
    }

    if (currentState.step === "awaiting_description") {
      const summary = currentState.summary;
      const description = text;

      userStates.delete(login);

      const tracker = await createTrackerIssue(summary, description, login);

      if (tracker.ok) {
        const issueKey = tracker?.data?.key || "создана";
        await sendBotMessage(
          login,
          `Задача создана: ${issueKey}`,
          "main"
        );
      } else {
        await sendBotMessage(
          login,
          `Не удалось создать задачу. Код: ${tracker.status}`,
          "main"
        );
      }

      return res.status(200).end();
    }

    userStates.delete(login);

    await sendBotMessage(
      login,
      "Что-то пошло не так. Нажми кнопку ниже ещё раз.",
      "main"
    );

    return res.status(200).end();
  } catch (error) {
    console.log("WEBHOOK ERROR:", error?.message || error);
    return res.status(200).end();
  }
}
