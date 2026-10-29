import Skeleton from './Skeleton.jsx'

const densityClasses = {
  comfortable: 'min-h-14 p-4',
  compact: 'min-h-12 p-3',
}

function getRowKey(row, rowKey) {
  return typeof rowKey === 'function' ? rowKey(row) : row[rowKey]
}

export default function DataTable({
  caption,
  captionHidden = false,
  columns,
  density = 'comfortable',
  emptyMessage = 'No records found.',
  isLoading = false,
  isRowSelected,
  loadingRowCount = 4,
  rowKey = 'id',
  rows,
}) {
  const columnCount = columns.length
  const cellClasses = densityClasses[density]

  return (
    <div
      aria-label={caption ? `${caption} scroll area` : 'Data table scroll area'}
      className="max-w-full overflow-x-auto rounded-control border border-border bg-surface focus-visible:outline-offset-2"
      role="region"
      tabIndex="0"
    >
      {isLoading ? (
        <span className="sr-only" role="status">
          Loading {caption || 'table data'}
        </span>
      ) : null}
      <table
        aria-busy={isLoading || undefined}
        className="w-full min-w-[46rem] text-left text-table text-text max-md:min-w-[42rem] [&_tbody_tr:last-child_td]:border-b-0"
      >
        {caption ? (
          <caption
            className={
              captionHidden
                ? 'sr-only'
                : 'p-4 text-left text-section font-semibold text-text'
            }
          >
            {caption}
          </caption>
        ) : null}
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                className={`${cellClasses} border-b border-border bg-surface-subtle align-middle text-meta font-bold tracking-[0.025em] text-text-secondary uppercase`}
                key={column.key}
                scope="col"
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading
            ? Array.from({ length: loadingRowCount }, (_, rowIndex) => (
                <tr key={`loading-${rowIndex}`}>
                  {columns.map((column, columnIndex) => (
                    <td
                      className={`${cellClasses} border-b border-border align-middle`}
                      key={column.key}
                    >
                      <Skeleton width={columnIndex === 0 ? '8rem' : '70%'} />
                    </td>
                  ))}
                </tr>
              ))
            : null}
          {!isLoading && rows.length === 0 ? (
            <tr>
              <td
                className={`${cellClasses} border-b border-border text-center text-text-secondary`}
                colSpan={columnCount}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : null}
          {!isLoading
            ? rows.map((row) => {
                const selected = isRowSelected ? Boolean(isRowSelected(row)) : undefined
                return (
                  <tr
                    aria-selected={selected}
                    className={[
                      'hover:bg-primary-soft',
                      selected
                        ? 'bg-primary-soft shadow-[inset_3px_0_0_var(--color-primary)]'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    key={getRowKey(row, rowKey)}
                  >
                    {columns.map((column) => (
                      <td
                        className={`${cellClasses} border-b border-border align-middle`}
                        key={column.key}
                      >
                        {column.render ? column.render(row) : row[column.key]}
                      </td>
                    ))}
                  </tr>
                )
              })
            : null}
        </tbody>
      </table>
    </div>
  )
}
