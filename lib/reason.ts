/**
 * The field a reason of the library is about. The library starts each reason with the name of
 * what it refused, and `named` says which field of a form that name belongs to.
 */
export function fieldNamed<F extends string>(
  message: string,
  named: Readonly<Record<string, F>>
): F | null {
  const name = message.split(" ", 1)[0]
  return Object.hasOwn(named, name) ? named[name] : null
}
