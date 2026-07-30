const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not set. Refusing to boot with an undefined secret.");
}

const JWT_EXPIRES = process.env.JWT_EXPIRES || "30d";

function signToken(user) {
  if (!user || !user.id || !user.role) {
    throw new Error("Cannot sign token for invalid user.");
  }

  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      name: user.name,
      phone: user.phone,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

function verifyPassword(plain, hash) {
  if (
    typeof plain !== "string" ||
    typeof hash !== "string" ||
    !plain ||
    !hash
  ) {
    return false;
  }

  return bcrypt.compareSync(plain, hash);
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Missing auth token",
    });
  }

  const token = header.substring(7).trim();

  if (!token) {
    return res.status(401).json({
      error: "Missing auth token",
    });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({
      error: "Invalid or expired token",
    });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({
      error: "Admin access required",
    });
  }

  return next();
}

module.exports = {
  signToken,
  verifyPassword,
  requireAuth,
  requireAdmin,
};