const awaitingTask = new Set();

async function sendBotMessage(login, text, withMenu = false) {
  const body = {
    login,
    text,
  };

  if (withMenu) {
    body.suggest_buttons = {
      layout: "true",
      persist: true,
      buttons: [[
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
      ]]
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
}

async function createTrackerIssue(summary) {
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
        queue: "DANILVITT",
        assignee: "danil",
        tags: ["from_bot_personal"]
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

    const serverActionName =
      update?.bot_request?.server_action?.name;

    if (serverActionName === "create_personal_task") {
      awaitingTask.add(login);

      await sendBotMessage(
        login,
        "Напиши задачу одним сообщением",
        false
      );

      return res.status(200).end();
    }

    const text = (update?.text || "").trim();

    if (!text) {
      await sendBotMessage(
        login,
        "Нажми кнопку ниже",
        true
      );
      return res.status(200).end();
    }

    if (!awaitingTask.has(login)) {
      await sendBotMessage(
        login,
        "Нажми кнопку ниже",
        true
      );
      return res.status(200).end();
    }

    awaitingTask.delete(login);

    const tracker = await createTrackerIssue(text);

    if (tracker.ok) {
      const issueKey = tracker?.data?.key || "создана";
      await sendBotMessage(
        login,
        `Задача создана: ${issueKey}`,
        true
      );
    } else {
      await sendBotMessage(
        login,
        `Не удалось создать задачу. Код: ${tracker.status}`,
        true
      );
    }

    return res.status(200).end();
  } catch (error) {
    console.log("WEBHOOK ERROR:", error?.message || error);
    return res.status(200).end();
  }
}
