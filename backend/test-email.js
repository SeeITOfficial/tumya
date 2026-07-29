require("dotenv").config();

const { sendVerificationCode } = require("./lib/email");

(async () => {
  try {
    await sendVerificationCode(
      process.env.EMAIL_USER,
      "123 456"
    );

    console.log("✅ Email sent successfully");
  } catch (err) {
    console.error(err);
  }
})();