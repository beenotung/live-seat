import { o } from '../jsx/jsx.js'
import SourceCode from '../components/source-code.js'
import Style from '../components/style.js'
import { mapArray } from '../components/fragment.js'
import { Link, Redirect } from '../components/router.js'
import { StaticPageRoute, title } from '../routes.js'
import { castDynamicContext, Context, getContextFormBody } from '../context.js'
import { object, string } from 'cast.ts'
import { HttpError } from '../components/error.js'
import { sessions } from '../session.js'
import { ServerMessage } from '../../../client/types.js'
import { EarlyTerminate } from '../helpers.js'
import { nodeToVNode } from '../jsx/vnode.js'
import { find, toSqliteTimestamp } from 'better-sqlite3-proxy'
import { proxy } from '../../../db/proxy.js'

type Seat = {
  is_booked: boolean
}

type SeatPlan = {
  rows: SeatRow[]
}

type SeatRow = {
  label: string | number
  cols: SeatCol[]
}

type SeatCol = {
  label: string | number
  seat?: Seat
}

let seatPlan: SeatPlan = {
  rows: [
    {
      label: 1,
      cols: [
        { label: 1, seat: { is_booked: false } },
        { label: 2, seat: { is_booked: true } },
        { label: 3, seat: { is_booked: false } },
      ],
    },
    {
      label: 2,
      cols: [
        { label: 1, seat: { is_booked: false } },
        { label: 2, seat: { is_booked: false } },
        { label: 3, seat: { is_booked: false } },
      ],
    },
    {
      label: 3,
      cols: [
        { label: 1, seat: { is_booked: true } },
        { label: 2, seat: { is_booked: true } },
        { label: 3, seat: { is_booked: true } },
      ],
    },
  ],
}

let index = (
  <div id="home">
    {Style(/* css */ `
table.seat-plan {
  border-collapse: collapse;
}
.seat-plan .seat {
  border: 1px solid black;
  font-size: 2rem;
  width: 3rem;
  height: 3rem;
  display: flex;
  justify-content: center;
  align-items: center;
  text-decoration: none;
}
.seat.available {
  background-color: green;
  color: white;
}
.seat.occupied {
  background-color: red;
  color: white;
}
`)}
    <h2>Home Page</h2>
    <p>即時更新嘅電影院座位表</p>

    <div className="d-flex">
      <div className="flex-grow">
        <SeatPlanTable />
      </div>
      <div className="flex-grow">
        <SeatForm />
      </div>
    </div>

    <SourceCode page="home.tsx" />
  </div>
)

function SeatPlanTable() {
  return (
    <table class="seat-plan">
      <tbody>
        {mapArray(seatPlan.rows, row => (
          <tr>
            {mapArray(row.cols, col => (
              <td>
                <Link
                  href={`/seat-plan/${row.label}/${col.label}`}
                  data-row={row.label}
                  data-col={col.label}
                  class={
                    'seat ' +
                    (findSeat({ row: row.label, col: col.label }).is_booked
                      ? 'occupied'
                      : 'available')
                  }
                >
                  {row.label}
                  {col.label}
                </Link>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function SeatForm(attrs: {}, _context: Context) {
  let context = castDynamicContext(_context)
  let params = context.routerMatch?.params
  console.log('params:', params)
  let seat = findSeat(params)
  if (!seat) {
    return <p>Hint: click the green seat to make a booking.</p>
  }
  let label = params.row + params.col
  return (
    <form method="POST" action="/seat-plan/book" onsubmit="emitForm(event)">
      <h2>Seat {label}</h2>
      <div id="book-seat-container">
        <p>Status: {seat.is_booked ? 'occupied' : 'available'}</p>
        <input name="row" value={params.row} hidden />
        <input name="col" value={params.col} hidden />
        <input
          disabled={seat.is_booked || undefined}
          type="submit"
          value="Book this seat"
        />
      </div>
    </form>
  )
}

function findSeat(pos: { row: string | number; col: string | number }) {
  if (
    find(proxy.booking, {
      row: String(pos.row),
      col: String(pos.col),
    })?.book_time
  ) {
    return { is_booked: true }
  }
  return { is_booked: false }
}

let createBookingParser = object({
  row: string({ nonEmpty: true, trim: true }),
  col: string({ nonEmpty: true, trim: true }),
})
function CreateBooking(attrs: {}, context: Context) {
  let pos = createBookingParser.parse(getContextFormBody(context))
  let seat = findSeat(pos)
  let label = pos.row + pos.col
  if (!seat) {
    throw new HttpError(404, 'seat not found')
  }
  // seat.is_booked = true
  proxy.booking.push({
    row: pos.row,
    col: pos.col,
    book_time: toSqliteTimestamp(new Date()),
  })

  let message: ServerMessage = [
    'update-attrs',
    `.seat[data-row="${pos.row}"][data-col="${pos.col}"]`,
    { class: 'seat occupied' },
  ]

  let ws = context.type === 'ws' ? context.ws : null

  sessions.forEach(session => {
    if (session.ws != ws && session.url != '/') return
    session.ws.send(message)
  })

  if (ws) {
    ws.send([
      'batch',
      [
        [
          'update-text',
          '#book-seat-container',
          'Booked seat ' + label + ' (successful)',
        ],
        ['append', 'body', nodeToVNode(<Redirect href="/" />, context)],
      ],
    ])
    throw EarlyTerminate
  }

  return (
    <div>
      <p>Booked seat {label}</p>
      <Link href="/">Check more seats</Link>
    </div>
  )
}

let seatPlanElement = {
  resolve: (_context: Context): StaticPageRoute => {
    let context = castDynamicContext(_context)
    let params = context.routerMatch?.params

    let label = params.row + params.col

    let seat = findSeat(params)

    let status = seat?.is_booked ? 'occupied' : 'available'

    return {
      title: title('Seat ' + label + ': ' + status),
      description: 'The realtime status of Seat ' + label + ' : ' + status,
      node: index,
    }
  },
}

export default { index, seatPlanElement, CreateBooking }
