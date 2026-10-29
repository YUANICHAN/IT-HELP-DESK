import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import DataTable from './DataTable.jsx'
import Pagination from './Pagination.jsx'

const rows = [
  { id: '1', reference: 'DF-1048', title: 'New starter laptop setup' },
  { id: '2', reference: 'DF-1047', title: 'Cannot access shared drive' },
]

const columns = [
  {
    key: 'reference',
    header: 'Ticket',
    render: (row) => <a href={`#${row.id}`}>{row.reference}</a>,
  },
  { key: 'title', header: 'Summary' },
]

function PaginationHarness({ onPageChange }) {
  const [page, setPage] = useState(1)

  function handlePageChange(nextPage) {
    onPageChange(nextPage)
    setPage(nextPage)
  }

  return (
    <Pagination
      onPageChange={handlePageChange}
      page={page}
      pageSize={2}
      totalItems={6}
      totalPages={3}
    />
  )
}

describe('DataTable and Pagination', () => {
  it('renders a captioned semantic table with column headers and selected rows', () => {
    render(
      <DataTable
        caption="Synthetic ticket queue"
        captionHidden
        columns={columns}
        isRowSelected={(row) => row.id === '1'}
        rows={rows}
      />,
    )

    expect(
      screen.getByRole('table', { name: 'Synthetic ticket queue' }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader')).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'DF-1048' })).toHaveAttribute(
      'href',
      '#1',
    )
    expect(screen.getByRole('row', { name: /DF-1048/i })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('reports page requests to its parent and reflects controlled updates', async () => {
    const user = userEvent.setup()
    const onPageChange = vi.fn()
    render(<PaginationHarness onPageChange={onPageChange} />)

    expect(screen.getByRole('button', { name: 'Go to previous page' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Go to next page' }))

    expect(onPageChange).toHaveBeenCalledWith(2)
    expect(screen.getByText('Showing 3–4 of 6')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Go to previous page' })).toBeEnabled()
  })
})
