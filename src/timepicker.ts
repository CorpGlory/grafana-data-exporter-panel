import { react2AngularDirective } from './react2angular';

// it's TimePicker since Grafana 6.2.0 and TimeRangePicker since Grafana 7.0
// @ts-ignore
import { TimePicker, TimeRangePicker } from '@grafana/ui';

// we don't know which one we'll use so we import both and pick the one that is not undefined
const timePicker = TimePicker || TimeRangePicker;
react2AngularDirective('timepicker', timePicker, [
  // TODO: there are more props
  'value',
  'onChange',
  'onMoveBackward',
  'onMoveForward',
  'onZoom'
]);
