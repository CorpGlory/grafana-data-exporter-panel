import { react2AngularDirective } from './react2angular';

// it's TimePicker since Grafana 6.2.0 and TimeRangePicker since Grafana 7.0
// @ts-ignore
import { TimePicker, TimeRangePicker } from '@grafana/ui';

const timePicker = TimePicker || TimeRangePicker;
react2AngularDirective('timepicker', timePicker, [
  // TODO: there are more props
  'value',
  'onChange',
  'onMoveBackward',
  'onMoveForward',
  'onZoom'
]);
