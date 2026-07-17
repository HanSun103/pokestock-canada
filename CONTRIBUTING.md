# Contributing

Thank you for helping Canadian collectors find trustworthy information.

## Catalog contributions

1. Use a first-party Pokémon source for release claims whenever possible.
2. Use a Canada-specific public source for CAD prices and availability.
3. Record the date you personally verified the source.
4. Leave uncertain values as `null`; do not estimate or convert currency.
5. Run `npm test` and `npm run check:data`.

Pull requests should explain what changed and link the supporting sources. Do not submit private endpoints, leaked product data, automated purchasing code, or methods that evade access controls.

## Code contributions

Keep the static POC accessible and dependency-light. New controls must work by keyboard, visible focus states must remain, and status must not be communicated by color alone.
