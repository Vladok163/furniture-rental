import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'

export default function Inventory() {
  const [inventory, setInventory] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    const [{ data: inv }, { data: ord }] = await Promise.all([
      supabase.from('inventory').select('*').order('id'),
      supabase.from('orders')
        .select('*, clients(name), order_items(quantity, inventory_id)')
        .neq('status', 'done')
        .lte('start_date', todayStr)
        .gte('end_date', todayStr),
    ])
    setInventory(inv || [])
    setOrders(ord || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const busyCounts = {}
  inventory.forEach(i => { busyCounts[i.id] = 0 })
  orders.forEach(o => {
    ;(o.order_items || []).forEach(it => {
      busyCounts[it.inventory_id] = (busyCounts[it.inventory_id] || 0) + it.quantity
    })
  })

  return (
    <>
      <div className="page-header">
        <span className="page-title">Склад</span>
      </div>
      <div className="page-body">
        {loading ? <div className="empty">Загрузка...</div> : (
          <>
            <div className="inv-grid">
              {inventory.map(inv => {
                const busy = busyCounts[inv.id] || 0
                const free = inv.total_qty - busy
                const frac = inv.total_qty > 0 ? busy / inv.total_qty : 0
                return (
                  <div key={inv.id} className="inv-card">
                    <div className="inv-card-name">{inv.name}</div>
                    <div className="inv-nums">
                      <div className="inv-num-block">
                        <div className="inv-num-val busy">{busy}</div>
                        <div className="inv-num-label">В аренде</div>
                      </div>
                      <div className="inv-num-block" style={{marginLeft:24}}>
                        <div className={`inv-num-val ${free > 0 ? 'free' : 'busy'}`}>{free}</div>
                        <div className="inv-num-label">Свободно</div>
                      </div>
                      <div className="inv-num-block" style={{marginLeft:24}}>
                        <div className="inv-num-val">{inv.total_qty}</div>
                        <div className="inv-num-label">Всего</div>
                      </div>
                    </div>
                    {/* bar */}
                    <div style={{marginTop:16,height:8,background:'var(--border)',borderRadius:4,overflow:'hidden'}}>
                      <div style={{height:'100%',width:`${frac*100}%`,background: frac>=1?'var(--red)':frac>0.7?'#f0874a':'var(--green)',borderRadius:4,transition:'width 0.3s'}}/>
                    </div>
                    <div className="inv-price">{inv.price_per_day.toLocaleString('ru-RU')} ₽ / сутки</div>
                  </div>
                )
              })}
            </div>

            {/* Active rentals table */}
            {orders.length > 0 && (
              <>
                <div className="section-title">Сейчас в аренде</div>
                <div className="card" style={{padding:0,overflow:'hidden'}}>
                  <table>
                    <thead>
                      <tr>
                        <th>Клиент</th>
                        {inventory.map(i => <th key={i.id}>{i.name}</th>)}
                        <th>До</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map(o => (
                        <tr key={o.id}>
                          <td className="td-name">{o.clients?.name}</td>
                          {inventory.map(i => {
                            const item = (o.order_items||[]).find(it => it.inventory_id === i.id)
                            return <td key={i.id} style={{fontSize:17,fontWeight:item?.quantity?600:400,color:item?.quantity?'var(--text)':'var(--text-muted)'}}>
                              {item?.quantity || '—'}
                            </td>
                          })}
                          <td style={{fontSize:14}}>{o.end_date}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </>
  )
}
