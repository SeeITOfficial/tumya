require("dotenv").config();

const { sendOrderPlaced } = require("./lib/email");

(async () => {
  try {
    await sendOrderPlaced({
      email: "stephseeit@gmail.com",
      customerName: "Stephen",
      orderNumber: "TMY-20260729-001",
      total: "2,450",
    });

    console.log("✅ Order Placed email sent successfully");
  } catch (err) {
    console.error(err);
  }
})();