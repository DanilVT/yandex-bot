export default async function handler(req, res) {
  const data = req.body;

  console.log("ПРИШЛО:", data);

  return res.status(200).json({
    text: "Я получил сообщение"
  });
}
