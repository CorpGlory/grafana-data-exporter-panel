import { DatasourceRequest } from './models/datasource';

import './css/panel.base.scss';
import './css/panel.dark.scss';
import './css/panel.light.scss';

import { MetricsPanelCtrl } from 'grafana/app/plugins/sdk';
import { appEvents } from 'grafana/app/core/core';

import _ from 'lodash';
import $ from 'jquery';
import moment from 'moment';


// TODO: add to types-grafana
declare var grafanaBootData: any;

const PANEL_DEFAULTS = {
  backendUrl: ''
}

class Ctrl extends MetricsPanelCtrl {
  private _backendSrv;
  private _panelPath: string;
  private _partialsPath: string;
  public showRows: Object;
  private _element;
  public rangeOverride: {
    from: string,
    to: string
  };
  public rangeOverrideRaw: {
    from: string,
    to: string
  };
  public datePickerShow: {
    from: Boolean,
    to: Boolean
  };
  private _datasourceRequest: DatasourceRequest;

  static templateUrl = 'partials/module.html';

  /** @ngInject */
  constructor($scope, $injector, backendSrv) {
    super($scope, $injector);
    _.defaults(this.panel, PANEL_DEFAULTS);
    this._backendSrv = backendSrv;
    this._panelPath = `/public/plugins/${this.pluginId}`;
    this._partialsPath = `${this._panelPath}/partials`;

    this.events.on('render', this._onRender.bind(this));
    this.events.on('init-edit-mode', this._onInitEditMode.bind(this));

    appEvents.on('ds-request-response', data => {
      let requestConfig = data.config;
      let type;
      if(requestConfig.inspect !== undefined) {
        type = requestConfig.inspect.type;
      } else {
        type = '';
      }
      this._datasourceRequest = {
        url: requestConfig.url,
        type,
        method: requestConfig.method,
        data: requestConfig.data,
        params: requestConfig.params
      };
    });

    this.clearRange();
    this.showRows = {};

    $(document.body).on('click', '.delete-task', e => {
      e.preventDefault();
      let url = $(e.currentTarget).attr('href');
      this._showConfirmationModal(url);
    });
  }

  link(scope, element) {
    this._element = element;
    this._initStyles();

    for(let panel of this.panels) {
      this.showRows[panel.id] = false;
    }
  }

  async _getCurrentUser() {
    return this._backendSrv.get('/api/user')
      .then(data => data.login)
  }

  _initStyles() {
    (<any>window).System.import(`${this._panelPath}/css/panel.base.css!`);
    if(grafanaBootData.user.lightTheme) {
      (<any>window).System.import(`${this._panelPath}/css/panel.light.css!`);
    } else {
      (<any>window).System.import(`${this._panelPath}/css/panel.dark.css!`);
    }
  }

  _onRender() {
    this._element.find('.table-panel-scroll').css({ 'max-height': this._getTableHeight() });
  }

  _onInitEditMode() {
    this.addEditorTab(
      'Options', `${this._partialsPath}/editor.options.html`, 2
    );
  }

  _getTableHeight() {
    return this.height - 31 + 'px';
  }

  showExportModal(panelId, target) {
    let modalScope = this.$scope.$new(true);
    modalScope.ctrl = this;
    modalScope.panelId = panelId;
    modalScope.target = target;

    appEvents.emit('show-modal', {
      src: `${this._partialsPath}/modal.export.html`,
      scope: modalScope
    });
  }

  _showConfirmationModal(url) {
    let modalScope = this.$scope.$new(true);
    modalScope.ctrl = this;
    modalScope.url = url;

    appEvents.emit('show-modal', {
      src: `${this._partialsPath}/modal.confirmation.html`,
      modalClass: 'confirm-modal',
      scope: modalScope
    });
  }

  toggleTargetRows(panelId) {
    this.showRows[panelId] = !this.showRows[panelId];
    this.render();
  }

  onRangeFromChange() {
    this.rangeOverride.from = moment(this.rangeOverrideRaw.from).format();
  }

  onRangeToChange() {
    this.rangeOverride.to = moment(this.rangeOverrideRaw.to).format();
  }

  async export(panelId, target) {
    let panelUrl = window.location.origin + window.location.pathname + `?panelId=${panelId}&fullscreen`;

    let user = await this._getCurrentUser();

    this._backendSrv.post(`${this.panel.backendUrl}/tasks`, {
      from: moment(this.rangeOverride.from).valueOf(),
      to: moment(this.rangeOverride.to).valueOf(),
      panelUrl,
      target,
      datasourceRequest: this._datasourceRequest,
      user
    })
      .then(data => {
        appEvents.emit('alert-success', ['Success', data]);
        appEvents.emit('hide-modal');
        this.clearRange();
        this.timeSrv.refreshDashboard();
      })
      .catch(err => appEvents.emit('alert-error', [`Error while adding task at ${err.config.url}`, err.statusText]));
  }

  clearRange() {
    this.rangeOverride = {
      from: '',
      to: ''
    };
    this.rangeOverrideRaw = {
      from: '',
      to: ''
    };
    this.datePickerShow = {
      from: true,
      to: true
    };
    appEvents.emit('hide-modal');
  }

  onDelete(url) {
    this._backendSrv.get(url)
      .then(() => this.timeSrv.refreshDashboard());
    appEvents.emit('hide-modal');
  }

  get panels() {
    return this.dashboard.panels;
  }

}

export { Ctrl as PanelCtrl }
