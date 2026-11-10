import {businessDayBounds} from '../../src/lib/domain/daybook/business-date';
// Proposed action-boundary normalization only. Existing production actions do
// not yet call this. Date labels are local business midnight; instants stay exact.
export function businessTimestampForWrite(value:string|Date):Date {
 if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value))return businessDayBounds(value).start;
 const date=value instanceof Date?new Date(value):new Date(value);
 if(Number.isNaN(date.getTime()))throw Error('Business timestamp is invalid');
 return date;
}
