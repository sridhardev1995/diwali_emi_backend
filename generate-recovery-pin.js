const bcrypt = require('bcrypt');

async function main() {
  const pin = '482915';

  const hash = await bcrypt.hash(pin, 10);

  console.log('Recovery PIN Hash:');
  console.log(hash);
}

main();