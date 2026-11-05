# TODO

## Next

- **Hide bases even when they're fractured.** NeverSink shows fractured items above most hide rules
  (the "exotic → fractured" tiers), so a base you hid still shows up when it drops fractured.
  Add an option per hidden base (and on My bases / the price check's "Hide…") to also hide it
  when it's fractured: write a `Hide` block with `FracturedItem True` + that `BaseType`, placed
  above NeverSink's fractured tiers. Optionally a whole-category switch ("hide fractured items
  of hidden bases"), and the same for synthesised items.

## Later

- Check the live poe.ninja and trade API responses against the parsers after each league start.
