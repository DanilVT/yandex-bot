export default async function handler(req, res) {
  // логируем всё
  const data = req.body;
  console.log("ПРИШЛО:", data);

  // ВАЖНО: всегда отвечаем 200 и простым текстом
  res.status(200).json({});
}
