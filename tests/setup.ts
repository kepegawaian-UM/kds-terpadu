import "dotenv/config";

// Tes integrasi memakai database terpisah (TEST_DATABASE_URL) dan menolak jalan di database
// yang namanya tidak berakhiran "_test" - supaya tidak pernah menyentuh data pengembangan.
const url = process.env.TEST_DATABASE_URL;
if (url) {
  const nama = new URL(url).pathname.replace("/", "");
  if (!nama.endsWith("_test")) {
    throw new Error(`TEST_DATABASE_URL harus menunjuk database berakhiran _test (sekarang: ${nama})`);
  }
  process.env.DATABASE_URL = url;
  process.env.DATABASE_URL_UNPOOLED = url;
}
