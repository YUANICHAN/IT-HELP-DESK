import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Checkbox from './Checkbox.jsx'
import Input from './Input.jsx'
import Select from './Select.jsx'
import Textarea from './Textarea.jsx'

describe('form controls', () => {
  it('associates visible labels, help text, and validation errors', () => {
    render(
      <>
        <Input
          error="Enter a ticket title."
          helpText="Summarize the issue."
          label="Ticket title"
          required
        />
        <Select
          helpText="Choose the affected service."
          label="Service category"
          options={[{ value: 'hardware', label: 'Hardware support' }]}
        />
        <Textarea error="Add more detail." label="Description" />
        <Checkbox
          helpText="Updates are sent by Deskflow."
          label="Notify me about updates"
        />
      </>,
    )

    const title = screen.getByLabelText(/ticket title/i)
    const titleDescriptions = title.getAttribute('aria-describedby').split(' ')

    expect(title).toBeRequired()
    expect(title).toHaveAttribute('aria-invalid', 'true')
    expect(titleDescriptions).toHaveLength(2)
    expect(document.getElementById(titleDescriptions[0])).toHaveTextContent(
      'Summarize the issue.',
    )
    expect(document.getElementById(titleDescriptions[1])).toHaveTextContent(
      'Enter a ticket title.',
    )
    expect(screen.getByLabelText('Service category')).toHaveAccessibleDescription(
      'Choose the affected service.',
    )
    expect(screen.getByLabelText('Description')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(screen.getByLabelText('Notify me about updates')).toHaveAccessibleDescription(
      'Updates are sent by Deskflow.',
    )
  })
})
