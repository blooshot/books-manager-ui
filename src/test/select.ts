import { screen } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'

const trigger = (label: string | RegExp) => screen.getByRole('combobox', { name: label })

/** Uses a themed dropdown like a person does: open it, then click the option. */
export async function chooseOption(user: UserEvent, label: string | RegExp, option: string): Promise<void> {
  await user.click(trigger(label))
  await user.click(await screen.findByRole('option', { name: option }))
}

/** The names in a dropdown's open list, in order (opens it, reads it, closes it again). */
export async function optionsOf(user: UserEvent, label: string | RegExp): Promise<string[]> {
  await user.click(trigger(label))
  const names = (await screen.findAllByRole('option')).map((o) => o.textContent ?? '')
  await user.keyboard('{Escape}')
  return names
}

/** What a dropdown currently shows. */
export const shownIn = (label: string | RegExp): string => trigger(label).textContent ?? ''
