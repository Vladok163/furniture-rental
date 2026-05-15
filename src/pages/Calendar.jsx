import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, parseISO, addMonths, subMonths, isSameDay, isToday } from 'date-fns'
import { ru } from 'date-fns/locale'

export default function Calendar() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [orders, setOrders] = useState([])
  const [inventory, setInventory] = useState([])
  const [selectedDay, setSelectedDay] = useState(null)
  const [dayOrders, setDayOrders] = useState([])

  async function load() {
    const [{ data: inv }, { data: ord }] = await Promise.all([
      supabase.from('inventory').select('*'),
      supabase.from('orders')
        .select('*, clients(name, phone), order_items(quantity, inventory_id)')
        .neq('status', 'done'),
    ])
    setInventory(inv || [])
    setOrders(ord || [])
  }

  useEffect(() => { load() }, [])

  const totalQty = inventory.reduce((s, i) => s + i.total_qty, 0)

  function getBusyFraction(date) {
    const d = format(date, 'yyyy-MM-dd')
    let busy = 0
    orders.forEach(o => {
      if (o.start_date <= d && o.end_date >= d) {
        ;(o.order_items || []).forEach(it => { busy += it.quantity })
      }
    })
    if (totalQty === 0) return 0
    return Math.min(1, busy / totalQty)
  }

  function getOrdersForDay(date) {
    const d = format(date, 'yyyy-MM-dd')
    return orders.filter(o => o.start_date <= d && o.end_date >= d)
  }

  function heatColor(fraction) {
    if (fraction === 0) return 'transparent'
    if (fraction < 0.25) return '#d4edda'
    if (fraction < 0.5) return '#a8d5b5'
    if (fraction < 0.75) return '#f5c842'
    if (fraction < 1) return '#f0874a'
    return '#e05252'
  }

  function heatText(fraction) {
    if (fraction === 0) return null
    if (fraction < 0.5) return { color: '#1a5c2a', label: `${Math.round(fraction*100)}%` }
    if (fraction < 0.75) return { color: '#7a4800', label: `${Math.round(fraction*100)}%` }
    return { color: '#7a1a1a', label: `${Math.round(fraction*100)}%` }
  }

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const startPad = (getDay(monthStart) + 6) % 7

  function selectDay(date) {
    setSelectedDay(date)
    setDayOrders(getOrdersForDay(date))
  }

  function itemsSummary(o) {
    return (o.order_items || []).filter(i => i.quantity > 0)
      .map(i => {
        const inv = inventory.find(x => x.id === i.inventory_id)
        return `${i.quantity} ${inv?.name || ''}`
      }).join(' · ')
  }

  const DAY_NAMES = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']

  return (
    <>
      <div className="page-header">
        <span className="page-title">Календарь</span>
        <div style={{display:'flex',alignItems:'center',gap:16}}>
          <button className="btn btn-outline btn-sm" onClick={() => setCurrentMonth(m => subMonths(m,1))}>← Назад</button>
          <span style={{fontSize:18,fontWeight:600,minWidth:160,textAlign:'center'}}>
            {format(currentMonth,'LLLL yyyy',{locale:ru})}
          </span>
          <button className="btn btn-outline btn-sm" onClick={() => setCurrentMonth(m => addMonths(m,1))}>Вперёд →</button>
        </div>
      </div>
      <div className="page-body">
        {/* Legend */}
        <div style={{display:'flex',gap:16,alignItems:'center',flexWrap:'wrap'}}>
          <span style={{fontSize:13,color:'var(--text-muted)'}}>Загруженность:</span>
          {[['#d4edda','< 25%'],['#a8d5b5','25–50%'],['#f5c842','50–75%'],['#f0874a','75–99%'],['#e05252','100%']].map(([c,l])=>(
            <div key={l} style={{display:'flex',alignItems:'center',gap:6,fontSize:13}}>
              <div style={{width:16,height:16,borderRadius:4,background:c,border:'1px solid #ccc'}}></div>
              <span>{l}</span>
            </div>
          ))}
        </div>

        <div style={{display:'flex',gap:20,alignItems:'flex-start'}}>
          {/* Calendar grid */}
          <div style={{flex:'0 0 520px'}}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:4,marginBottom:8}}>
              {DAY_NAMES.map(d => (
                <div key={d} style={{textAlign:'center',fontSize:13,color:'var(--text-muted)',fontWeight:500,padding:'4px 0'}}>{d}</div>
              ))}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:4}}>
              {Array.from({length:startPad}).map((_,i) => <div key={'pad'+i}/>)}
              {days.map(date => {
                const frac = getBusyFraction(date)
                const ht = heatText(frac)
                const isSelected = selectedDay && isSameDay(date, selectedDay)
                const ordCount = getOrdersForDay(date).length
                return (
                  <div key={date.toISOString()} onClick={() => selectDay(date)}
                    style={{
                      borderRadius: 10,
                      padding: '8px 6px',
                      textAlign: 'center',
                      minHeight: 60,
                      background: heatColor(frac),
                      border: isToday(date) ? '2px solid var(--accent)' : isSelected ? '2px solid #2255cc' : '1px solid var(--border)',
                      cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                      transition: 'opacity 0.12s',
                    }}>
                    <span style={{fontSize:16,fontWeight:isToday(date)?700:500,color: ht?.color || 'var(--text)'}}>{format(date,'d')}</span>
                    {ordCount > 0 && <span style={{fontSize:12,fontWeight:600,color:ht?.color||'var(--text-muted)'}}>{ordCount} зак.</span>}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Day detail */}
          <div style={{flex:1}}>
            {selectedDay ? (
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                <div style={{fontWeight:600,fontSize:18}}>
                  {format(selectedDay,'d MMMM yyyy',{locale:ru})}
                </div>
                {dayOrders.length === 0 ? (
                  <div style={{color:'var(--text-muted)',fontSize:16,padding:'20px 0'}}>Нет заказов на этот день</div>
                ) : dayOrders.map(o => {
                  const rest = (o.total_amount||0) - (o.prepayment||0)
                  return (
                    <div key={o.id} className="card card-sm">
                      <div style={{fontWeight:600,fontSize:17}}>{o.clients?.name}</div>
                      <div style={{fontSize:14,color:'var(--text-muted)',marginTop:4}}>{o.clients?.phone}</div>
                      <div style={{fontSize:14,marginTop:8}}>{itemsSummary(o)}</div>
                      <div style={{display:'flex',justifyContent:'space-between',marginTop:10,alignItems:'center'}}>
                        <span style={{fontWeight:600,fontSize:16}}>{(o.total_amount||0).toLocaleString('ru-RU')} ₽</span>
                        <span style={{color: rest>0?'var(--amber)':'var(--green)',fontSize:14,fontWeight:500}}>
                          {rest > 0 ? `Остаток ${rest.toLocaleString('ru-RU')} ₽` : '✓ Оплачен'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{color:'var(--text-muted)',fontSize:16,padding:'20px 0'}}>Нажмите на день чтобы увидеть заказы</div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
