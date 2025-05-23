/* eslint-disable global-require */
import moment from 'moment';
import nconf from 'nconf';
import requireAgain from 'require-again';
import { v4 as generateUUID } from 'uuid';
import {
  generateRes,
  generateReq,
  generateTodo,
  generateDaily,
} from '../../../helpers/api-unit.helper';
import { cron, cronWrapper } from '../../../../website/server/libs/cron';
import { model as User } from '../../../../website/server/models/user';
import * as Tasks from '../../../../website/server/models/task';
import common from '../../../../website/common';
import * as analytics from '../../../../website/server/libs/analyticsService';
import { model as Group } from '../../../../website/server/models/group';

const CRON_TIMEOUT_WAIT = new Date(5 * 60 * 1000).getTime();
const CRON_TIMEOUT_UNIT = new Date(60 * 1000).getTime();

const pathToCronLib = '../../../../website/server/libs/cron';

describe('cron', async () => {
  let clock = null;
  let user;
  const tasksByType = {
    habits: [], dailys: [], todos: [], rewards: [],
  };
  let daysMissed = 0;

  beforeEach(async () => {
    user = new User({
      auth: {
        local: {
          username: 'username',
          lowerCaseUsername: 'username',
          email: 'email@example.com',
          salt: 'salt',
          hashed_password: 'hashed_password', // eslint-disable-line camelcase
        },
      },
    });

    sinon.spy(analytics, 'track');
  });

  afterEach(async () => {
    if (clock !== null) clock.restore();
    analytics.track.restore();
  });

  it('updates user.preferences.timezoneOffsetAtLastCron', async () => {
    const timezoneUtcOffsetFromUserPrefs = -1;

    await cron({
      user, tasksByType, daysMissed, analytics, timezoneUtcOffsetFromUserPrefs,
    });

    expect(user.preferences.timezoneOffsetAtLastCron).to.equal(1);
  });

  it('resets user.items.lastDrop.count', async () => {
    user.items.lastDrop.count = 4;
    await cron({
      user, tasksByType, daysMissed, analytics,
    });
    expect(user.items.lastDrop.count).to.equal(0);
  });

  it('increments user cron count', async () => {
    const cronCountBefore = user.flags.cronCount;
    await cron({
      user, tasksByType, daysMissed, analytics,
    });
    expect(user.flags.cronCount).to.be.greaterThan(cronCountBefore);
  });

  it('calls analytics', async () => {
    await cron({
      user, tasksByType, daysMissed, analytics,
    });
    expect(analytics.track.callCount).to.equal(1);
  });

  it('calls analytics when user is sleeping', async () => {
    user.preferences.sleep = true;
    await cron({
      user, tasksByType, daysMissed, analytics,
    });
    expect(analytics.track.callCount).to.equal(1);
  });

  describe('end of the month perks', async () => {
    beforeEach(async () => {
      user.purchased.plan.customerId = 'subscribedId';
      user.purchased.plan.dateUpdated = moment().subtract(1, 'months').toDate();
    });

    it('awards current mystery items to subscriber', async () => {
      user.purchased.plan.dateUpdated = new Date('2018-12-11');
      clock = sinon.useFakeTimers(new Date('2019-01-29'));
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.purchased.plan.mysteryItems.length).to.eql(2);
      const filteredNotifications = user.notifications.filter(n => n.type === 'NEW_MYSTERY_ITEMS');
      expect(filteredNotifications.length).to.equal(1);
    });

    it('awards multiple mystery item sets if user skipped months between logins', async () => {
      user.purchased.plan.dateUpdated = new Date('2018-11-11');
      clock = sinon.useFakeTimers(new Date('2019-01-29'));
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.purchased.plan.mysteryItems.length).to.eql(4);
      const filteredNotifications = user.notifications.filter(n => n.type === 'NEW_MYSTERY_ITEMS');
      expect(filteredNotifications.length).to.equal(1);
    });

    it('resets plan.gemsBought on a new month', async () => {
      user.purchased.plan.gemsBought = 10;
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.purchased.plan.gemsBought).to.equal(0);
    });

    it('resets plan.gemsBought on a new month if user does not have purchased.plan.dateUpdated', async () => {
      user.purchased.plan.gemsBought = 10;
      user.purchased.plan.dateUpdated = undefined;
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.purchased.plan.gemsBought).to.equal(0);
    });

    it('does not reset plan.gemsBought within the month', async () => {
      clock = sinon.useFakeTimers(moment().startOf('month').add(2, 'days').toDate());
      user.purchased.plan.dateUpdated = moment().startOf('month').toDate();

      user.purchased.plan.gemsBought = 10;
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.purchased.plan.gemsBought).to.equal(10);
    });

    it('resets plan.dateUpdated on a new month', async () => {
      const currentMonth = moment().startOf('month');
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(moment(user.purchased.plan.dateUpdated).startOf('month').isSame(currentMonth)).to.eql(true);
    });

    it('increments plan.consecutive.count', async () => {
      user.purchased.plan.consecutive.count = 0;
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.purchased.plan.consecutive.count).to.equal(1);
    });

    it('increments plan.cumulativeCount', async () => {
      user.purchased.plan.cumulativeCount = 0;
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.purchased.plan.cumulativeCount).to.equal(1);
    });

    it('increments plan.consecutive.count by more than 1 if user skipped months between logins', async () => {
      user.purchased.plan.dateUpdated = moment().subtract(2, 'months').toDate();
      user.purchased.plan.consecutive.count = 0;
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.purchased.plan.consecutive.count).to.equal(2);
    });

    it('increments plan.cumulativeCount by more than 1 if user skipped months between logins', async () => {
      user.purchased.plan.dateUpdated = moment().subtract(3, 'months').toDate();
      user.purchased.plan.cumulativeCount = 0;
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.purchased.plan.cumulativeCount).to.equal(3);
    });

    it('does not award unearned plan.consecutive.trinkets if subscription ended during an absence', async () => {
      user.purchased.plan.dateUpdated = moment().subtract(6, 'months').toDate();
      user.purchased.plan.dateTerminated = moment().subtract(3, 'months').toDate();
      user.purchased.plan.consecutive.count = 5;
      user.purchased.plan.consecutive.trinkets = 1;

      await cron({
        user, tasksByType, daysMissed, analytics,
      });

      expect(user.purchased.plan.consecutive.trinkets).to.equal(1);
    });

    it('does not increment plan.consecutive.gemCapExtra when user has reached the gemCap limit', async () => {
      user.purchased.plan.consecutive.gemCapExtra = 26;
      user.purchased.plan.consecutive.count = 5;
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.purchased.plan.consecutive.gemCapExtra).to.equal(26);
    });

    it('does not reset plan stats if we are before the last day of the cancelled month', async () => {
      user.purchased.plan.dateTerminated = moment(new Date()).add({ days: 1 });
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.purchased.plan.customerId).to.exist;
    });

    it('does reset plan stats if we are after the last day of the cancelled month', async () => {
      user.purchased.plan.dateTerminated = moment(new Date()).subtract({ days: 1 });
      user.purchased.plan.consecutive.gemCapExtra = 20;
      user.purchased.plan.consecutive.count = 5;

      await cron({
        user, tasksByType, daysMissed, analytics,
      });

      expect(user.purchased.plan.customerId).to.not.exist;
      expect(user.purchased.plan.consecutive.gemCapExtra).to.equal(20);
      expect(user.purchased.plan.consecutive.count).to.equal(0);
    });

    describe('for a 1-month recurring subscription', async () => {
      // create a user that will be used for all of these tests without a reset before each
      const user1 = new User({
        auth: {
          local: {
            username: 'username1',
            lowerCaseUsername: 'username1',
            email: 'email1@example.com',
            salt: 'salt',
            hashed_password: 'hashed_password', // eslint-disable-line camelcase
          },
        },
      });
      // user1 has a 1-month recurring subscription starting today
      beforeEach(async () => {
        user1.purchased.plan.customerId = 'subscribedId';
        user1.purchased.plan.dateUpdated = moment().toDate();
        user1.purchased.plan.planId = 'basic';
        user1.purchased.plan.consecutive.count = 0;
        user1.purchased.plan.consecutive.trinkets = 1;
        user1.purchased.plan.consecutive.gemCapExtra = 0;
      });

      it('increments consecutive benefits', async () => {
        clock = sinon.useFakeTimers(moment().utcOffset(0).startOf('month').add(1, 'months')
          .add(2, 'days')
          .toDate());
        // Add 1 month to simulate what happens a month after the subscription was created.
        // Add 2 days so that we're sure we're not affected by any start-of-month effects
        // e.g., from time zone oddness.
        await cron({
          user: user1, tasksByType, daysMissed, analytics,
        });
        expect(user1.purchased.plan.consecutive.count).to.equal(1);
        expect(user1.purchased.plan.consecutive.trinkets).to.equal(2);
        expect(user1.purchased.plan.consecutive.gemCapExtra).to.equal(2);
      });

      it('increments consecutive benefits correctly if user has been absent with continuous subscription', async () => {
        clock = sinon.useFakeTimers(moment().utcOffset(0).startOf('month').add(10, 'months')
          .add(2, 'days')
          .toDate());
        await cron({
          user: user1, tasksByType, daysMissed, analytics,
        });
        expect(user1.purchased.plan.consecutive.count).to.equal(10);
        expect(user1.purchased.plan.consecutive.trinkets).to.equal(11);
        expect(user1.purchased.plan.consecutive.gemCapExtra).to.equal(20);
      });
    });

    describe('for a 3-month recurring subscription', async () => {
      const user3 = new User({
        auth: {
          local: {
            username: 'username3',
            lowerCaseUsername: 'username3',
            email: 'email3@example.com',
            salt: 'salt',
            hashed_password: 'hashed_password', // eslint-disable-line camelcase
          },
        },
      });
      // user3 has a 3-month recurring subscription starting today
      beforeEach(async () => {
        user3.purchased.plan.customerId = 'subscribedId';
        user3.purchased.plan.dateUpdated = moment().toDate();
        user3.purchased.plan.planId = 'basic_3mo';
        user3.purchased.plan.consecutive.count = 0;
        user3.purchased.plan.consecutive.trinkets = 1;
        user3.purchased.plan.consecutive.gemCapExtra = 0;
      });

      it('increments consecutive benefits', async () => {
        clock = sinon.useFakeTimers(moment().utcOffset(0).startOf('month').add(1, 'months')
          .add(2, 'days')
          .toDate());
        await cron({
          user: user3, tasksByType, daysMissed, analytics,
        });
        expect(user3.purchased.plan.consecutive.count).to.equal(1);
        expect(user3.purchased.plan.consecutive.trinkets).to.equal(2);
        expect(user3.purchased.plan.consecutive.gemCapExtra).to.equal(2);
      });

      it('increments consecutive benefits correctly if user has been absent with continuous subscription', async () => {
        clock = sinon.useFakeTimers(moment().utcOffset(0).startOf('month').add(10, 'months')
          .add(2, 'days')
          .toDate());
        await cron({
          user: user3, tasksByType, daysMissed, analytics,
        });
        expect(user3.purchased.plan.consecutive.count).to.equal(10);
        expect(user3.purchased.plan.consecutive.trinkets).to.equal(11);
        expect(user3.purchased.plan.consecutive.gemCapExtra).to.equal(20);
      });
    });

    describe('for a 6-month recurring subscription', async () => {
      const user6 = new User({
        auth: {
          local: {
            username: 'username6',
            lowerCaseUsername: 'username6',
            email: 'email6@example.com',
            salt: 'salt',
            hashed_password: 'hashed_password', // eslint-disable-line camelcase
          },
        },
      });
      // user6 has a 6-month recurring subscription starting today
      beforeEach(async () => {
        user6.purchased.plan.customerId = 'subscribedId';
        user6.purchased.plan.dateUpdated = moment().toDate();
        user6.purchased.plan.planId = 'google_6mo';
        user6.purchased.plan.consecutive.count = 0;
        user6.purchased.plan.consecutive.trinkets = 1;
        user6.purchased.plan.consecutive.gemCapExtra = 0;
      });

      it('increments benefits', async () => {
        clock = sinon.useFakeTimers(moment().utcOffset(0).startOf('month').add(1, 'months')
          .add(2, 'days')
          .toDate());
        await cron({
          user: user6, tasksByType, daysMissed, analytics,
        });
        expect(user6.purchased.plan.consecutive.count).to.equal(1);
        expect(user6.purchased.plan.consecutive.trinkets).to.equal(2);
        expect(user6.purchased.plan.consecutive.gemCapExtra).to.equal(2);
      });
    });

    describe('for a 12-month recurring subscription', async () => {
      const user12 = new User({
        auth: {
          local: {
            username: 'username12',
            lowerCaseUsername: 'username12',
            email: 'email12@example.com',
            salt: 'salt',
            hashed_password: 'hashed_password', // eslint-disable-line camelcase
          },
        },
      });
      // user12 has a 12-month recurring subscription starting today
      user12.purchased.plan.customerId = 'subscribedId';
      user12.purchased.plan.dateUpdated = moment().toDate();
      user12.purchased.plan.planId = 'basic_12mo';
      user12.purchased.plan.consecutive.count = 0;
      user12.purchased.plan.consecutive.trinkets = 1;
      user12.purchased.plan.consecutive.gemCapExtra = 26;

      it('increments consecutive benefits the month after the second paid period has started', async () => {
        clock = sinon.useFakeTimers(moment().utcOffset(0).startOf('month').add(1, 'months')
          .add(2, 'days')
          .toDate());
        await cron({
          user: user12, tasksByType, daysMissed, analytics,
        });
        expect(user12.purchased.plan.consecutive.count).to.equal(1);
        expect(user12.purchased.plan.consecutive.trinkets).to.equal(2);
        expect(user12.purchased.plan.consecutive.gemCapExtra).to.equal(26);
      });

      it('increments consecutive benefits correctly if user has been absent with continuous subscription', async () => {
        clock = sinon.useFakeTimers(moment().utcOffset(0).startOf('month').add(10, 'months')
          .add(2, 'days')
          .toDate());
        await cron({
          user: user12, tasksByType, daysMissed, analytics,
        });
        expect(user12.purchased.plan.consecutive.count).to.equal(10);
        expect(user12.purchased.plan.consecutive.trinkets).to.equal(11);
        expect(user12.purchased.plan.consecutive.gemCapExtra).to.equal(26);
      });
    });

    describe('for a 3-month gift subscription (non-recurring)', async () => {
      const user3g = new User({
        auth: {
          local: {
            username: 'username3g',
            lowerCaseUsername: 'username3g',
            email: 'email3g@example.com',
            salt: 'salt',
            hashed_password: 'hashed_password', // eslint-disable-line camelcase
          },
        },
      });
      // user3g has a 3-month gift subscription starting today
      user3g.purchased.plan.customerId = 'Gift';
      user3g.purchased.plan.dateUpdated = moment().toDate();
      user3g.purchased.plan.dateTerminated = moment().startOf('month').add(3, 'months').add(15, 'days')
        .toDate();
      user3g.purchased.plan.planId = null;
      user3g.purchased.plan.consecutive.count = 0;
      user3g.purchased.plan.cumulativeCount = 0;
      user3g.purchased.plan.consecutive.trinkets = 1;
      user3g.purchased.plan.consecutive.gemCapExtra = 0;

      it('increments benefits', async () => {
        clock = sinon.useFakeTimers(moment().utcOffset(0).startOf('month').add(1, 'months')
          .add(2, 'days')
          .toDate());
        await cron({
          user: user3g, tasksByType, daysMissed, analytics,
        });
        expect(user3g.purchased.plan.consecutive.count).to.equal(1);
        expect(user3g.purchased.plan.cumulativeCount).to.equal(1);
        expect(user3g.purchased.plan.consecutive.trinkets).to.equal(2);
        expect(user3g.purchased.plan.consecutive.gemCapExtra).to.equal(2);
      });

      it('does not increment consecutive benefits in the month after the gift subscription has ended', async () => {
        clock = sinon.useFakeTimers(moment().utcOffset(0).startOf('month').add(4, 'months')
          .add(2, 'days')
          .toDate());
        await cron({
          user: user3g, tasksByType, daysMissed, analytics,
        });
        // subscription has been erased by now
        expect(user3g.purchased.plan.consecutive.count).to.equal(0);
        expect(user3g.purchased.plan.consecutive.trinkets).to.equal(2);
        expect(user3g.purchased.plan.consecutive.gemCapExtra).to.equal(2);
        expect(user3g.purchased.plan.cumulativeCount).to.equal(1);
      });
    });
  });

  describe('end of the month perks when user is not subscribed', async () => {
    beforeEach(async () => {
      user.purchased.plan.dateUpdated = moment().subtract(1, 'months').toDate();
    });

    it('resets plan.gemsBought on a new month', async () => {
      user.purchased.plan.gemsBought = 10;
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.purchased.plan.gemsBought).to.equal(0);
    });

    it('does not reset plan.gemsBought within the month', async () => {
      clock = sinon.useFakeTimers(moment().startOf('month').add(2, 'days').unix());
      user.purchased.plan.dateUpdated = moment().startOf('month').toDate();

      user.purchased.plan.gemsBought = 10;
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.purchased.plan.gemsBought).to.equal(10);
    });

    it('does not reset plan.dateUpdated on a new month', async () => {
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.purchased.plan.dateUpdated).to.be.empty;
    });

    it('does not increment plan.consecutive.count', async () => {
      user.purchased.plan.consecutive.count = 0;
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.purchased.plan.consecutive.count).to.equal(0);
    });

    it('does not increment plan.cumulativeCount', async () => {
      user.purchased.plan.cumulativeCount = 0;
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.purchased.plan.cumulativeCount).to.equal(0);
    });

    it('does not increment plan.consecutive.trinkets when user has reached a month that is a multiple of 3', async () => {
      user.purchased.plan.consecutive.count = 5;
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.purchased.plan.consecutive.trinkets).to.equal(0);
    });

    it('does not increment plan.consecutive.gemCapExtra when user has reached a month that is a multiple of 3', async () => {
      user.purchased.plan.consecutive.count = 5;
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.purchased.plan.consecutive.gemCapExtra).to.equal(0);
    });

    it('does not increment plan.consecutive.gemCapExtra when user has reached the gemCap limit', async () => {
      user.purchased.plan.consecutive.gemCapExtra = 26;
      user.purchased.plan.consecutive.count = 5;
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.purchased.plan.consecutive.gemCapExtra).to.equal(26);
    });

    it('does nothing to plan stats if we are before the last day of the cancelled month', async () => {
      user.purchased.plan.dateTerminated = moment(new Date()).add({ days: 1 });
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.purchased.plan.customerId).to.not.exist;
    });
  });

  describe('todos', async () => {
    beforeEach(async () => {
      const todo = {
        text: 'test todo',
        type: 'todo',
        value: 0,
      };

      const task = new Tasks.todo(Tasks.Task.sanitize(todo)); // eslint-disable-line new-cap
      tasksByType.todos.push(task);
    });

    afterEach(async () => {
      tasksByType.todos = [];
      user.tasksOrder.todos = [];
    });

    it('should make uncompleted todos redder', async () => {
      const valueBefore = tasksByType.todos[0].value;
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(tasksByType.todos[0].value).to.be.lessThan(valueBefore);
    });

    it('should not make completed todos redder', async () => {
      tasksByType.todos[0].completed = true;
      const valueBefore = tasksByType.todos[0].value;
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(tasksByType.todos[0].value).to.equal(valueBefore);
    });

    it('should add history of completed todos to user history', async () => {
      tasksByType.todos[0].completed = true;

      await cron({
        user, tasksByType, daysMissed, analytics,
      });

      expect(user.history.todos).to.be.lengthOf(1);
    });

    it('should remove completed todos from users taskOrder list', async () => {
      const todo = {
        text: 'test todo',
        type: 'todo',
        value: 0,
      };

      const task = new Tasks.todo(Tasks.Task.sanitize(todo)); // eslint-disable-line new-cap
      tasksByType.todos.push(task);
      tasksByType.todos[0].completed = true;

      user.tasksOrder.todos = tasksByType.todos.map(taskTodo => taskTodo._id);
      // Since ideally tasksByType should not contain completed todos,
      // fake ids should be filtered too
      user.tasksOrder.todos.push('00000000-0000-0000-0000-000000000000');

      expect(tasksByType.todos).to.be.lengthOf(2);
      expect(user.tasksOrder.todos).to.be.lengthOf(3);

      await cron({
        user, tasksByType, daysMissed, analytics,
      });

      // user.tasksOrder.todos should be filtered while tasks by type remains unchanged
      expect(tasksByType.todos).to.be.lengthOf(2);
      expect(user.tasksOrder.todos).to.be.lengthOf(1);
    });

    it('should preserve todos order in task list', async () => {
      const todo = {
        text: 'test todo',
        type: 'todo',
        value: 0,
      };

      let task = new Tasks.todo(Tasks.Task.sanitize(todo)); // eslint-disable-line new-cap
      tasksByType.todos.push(task);
      task = new Tasks.todo(Tasks.Task.sanitize(todo)); // eslint-disable-line new-cap
      tasksByType.todos.push(task);
      task = new Tasks.todo(Tasks.Task.sanitize(todo)); // eslint-disable-line new-cap
      tasksByType.todos.push(task);

      // Set up user.tasksOrder list in a specific order
      user.tasksOrder.todos = tasksByType.todos.map(todoTask => todoTask._id).reverse();
      const original = user.tasksOrder.todos; // Preserve the original order

      await cron({
        user, tasksByType, daysMissed, analytics,
      });

      let listsAreEqual = true;
      user.tasksOrder.todos.forEach((taskId, index) => {
        if (original[index]._id !== taskId) {
          listsAreEqual = false;
        }
      });

      expect(listsAreEqual);
      expect(user.tasksOrder.todos).to.be.lengthOf(original.length);
    });
  });

  describe('dailys', async () => {
    beforeEach(async () => {
      const daily = {
        text: 'test daily',
        type: 'daily',
      };

      const task = new Tasks.daily(Tasks.Task.sanitize(daily)); // eslint-disable-line new-cap
      tasksByType.dailys = [];
      tasksByType.dailys.push(task);

      const statsComputedRes = common.statsComputed(user);
      const stubbedStatsComputed = sinon.stub(common, 'statsComputed');
      stubbedStatsComputed.returns(Object.assign(statsComputedRes, { con: 1 }));
    });

    afterEach(async () => {
      common.statsComputed.restore();
    });

    it('computes isDue', async () => {
      tasksByType.dailys[0].frequency = 'daily';
      tasksByType.dailys[0].everyX = 5;
      tasksByType.dailys[0].startDate = moment().add(1, 'days').toDate();
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(tasksByType.dailys[0].isDue).to.be.false;
    });

    it('computes isDue when user is sleeping', async () => {
      user.preferences.sleep = true;
      tasksByType.dailys[0].frequency = 'daily';
      tasksByType.dailys[0].everyX = 5;
      tasksByType.dailys[0].startDate = moment().toDate();
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(tasksByType.dailys[0].isDue).to.exist;
    });

    it('computes nextDue', async () => {
      tasksByType.dailys[0].frequency = 'daily';
      tasksByType.dailys[0].everyX = 5;
      tasksByType.dailys[0].startDate = moment().add(1, 'days').toDate();
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(tasksByType.dailys[0].nextDue.length).to.eql(6);
    });

    it('should add history', async () => {
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(tasksByType.dailys[0].history).to.be.lengthOf(1);
    });

    it('should set tasks completed to false', async () => {
      tasksByType.dailys[0].completed = true;
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(tasksByType.dailys[0].completed).to.be.false;
    });

    it('should set tasks completed to false when user is sleeping', async () => {
      user.preferences.sleep = true;
      tasksByType.dailys[0].completed = true;
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(tasksByType.dailys[0].completed).to.be.false;
    });

    it('should reset task checklist for completed dailys', async () => {
      tasksByType.dailys[0].checklist.push({ title: 'test', completed: false });
      tasksByType.dailys[0].completed = true;
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(tasksByType.dailys[0].checklist[0].completed).to.be.false;
    });

    it('should reset task checklist for completed dailys when user is sleeping', async () => {
      user.preferences.sleep = true;
      tasksByType.dailys[0].checklist.push({ title: 'test', completed: false });
      tasksByType.dailys[0].completed = true;
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(tasksByType.dailys[0].checklist[0].completed).to.be.false;
    });

    it('should reset task checklist for dailys with scheduled misses', async () => {
      daysMissed = 10;
      tasksByType.dailys[0].checklist.push({ title: 'test', completed: false });
      tasksByType.dailys[0].startDate = moment(new Date()).subtract({ days: 1 });
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(tasksByType.dailys[0].checklist[0].completed).to.be.false;
    });

    it('should do damage for missing a daily', async () => {
      daysMissed = 1;
      const hpBefore = user.stats.hp;
      tasksByType.dailys[0].startDate = moment(new Date()).subtract({ days: 1 });
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.stats.hp).to.be.lessThan(hpBefore);
    });

    it('should not do damage for missing a daily when user is sleeping', async () => {
      user.preferences.sleep = true;
      daysMissed = 1;
      const hpBefore = user.stats.hp;
      tasksByType.dailys[0].startDate = moment(new Date()).subtract({ days: 1 });
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.stats.hp).to.equal(hpBefore);
    });

    it('should not do damage for missing a daily when CRON_SAFE_MODE is set', async () => {
      sandbox.stub(nconf, 'get').withArgs('CRON_SAFE_MODE').returns('true');
      const cronOverride = requireAgain(pathToCronLib).cron;

      daysMissed = 1;
      const hpBefore = user.stats.hp;
      tasksByType.dailys[0].startDate = moment(new Date()).subtract({ days: 1 });

      cronOverride({
        user, tasksByType, daysMissed, analytics,
      });

      expect(user.stats.hp).to.equal(hpBefore);
    });

    it('should not do damage for missing a daily if user stealth buff is greater than or equal to days missed', async () => {
      daysMissed = 1;
      const hpBefore = user.stats.hp;
      user.stats.buffs.stealth = 2;
      tasksByType.dailys[0].startDate = moment(new Date()).subtract({ days: 1 });

      await cron({
        user, tasksByType, daysMissed, analytics,
      });

      expect(user.stats.hp).to.equal(hpBefore);
    });

    it('should do less damage for missing a daily with partial completion', async () => {
      daysMissed = 1;
      let hpBefore = user.stats.hp;
      tasksByType.dailys[0].startDate = moment(new Date()).subtract({ days: 1 });
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      const hpDifferenceOfFullyIncompleteDaily = hpBefore - user.stats.hp;

      hpBefore = user.stats.hp;
      tasksByType.dailys[0].checklist.push({ title: 'test', completed: true });
      tasksByType.dailys[0].checklist.push({ title: 'test2', completed: false });
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      const hpDifferenceOfPartiallyIncompleteDaily = hpBefore - user.stats.hp;

      expect(hpDifferenceOfPartiallyIncompleteDaily)
        .to.be.lessThan(hpDifferenceOfFullyIncompleteDaily);
    });

    it('should decrement quest.progress.down for missing a daily', async () => {
      daysMissed = 1;
      tasksByType.dailys[0].startDate = moment(new Date()).subtract({ days: 1 });

      const progress = await cron({
        user, tasksByType, daysMissed, analytics,
      });

      expect(progress.down).to.equal(-1);
    });

    it('should not decrement quest.progress.down for missing a daily when user is sleeping', async () => {
      user.preferences.sleep = true;
      daysMissed = 1;
      tasksByType.dailys[0].startDate = moment(new Date()).subtract({ days: 1 });

      const progress = await cron({
        user, tasksByType, daysMissed, analytics,
      });

      expect(progress.down).to.equal(0);
    });

    it('should do damage for only yesterday\'s dailies', async () => {
      daysMissed = 3;
      tasksByType.dailys[0].startDate = moment(new Date()).subtract({ days: 1 });

      const daily = {
        text: 'test daily',
        type: 'daily',
      };
      const task = new Tasks.daily(Tasks.Task.sanitize(daily)); // eslint-disable-line new-cap
      tasksByType.dailys.push(task);
      tasksByType.dailys[1].startDate = moment(new Date()).subtract({ days: 2 });
      tasksByType.dailys[1].everyX = 2;
      tasksByType.dailys[1].frequency = 'daily';

      await cron({
        user, tasksByType, daysMissed, analytics,
      });

      expect(user.stats.hp).to.equal(48);
    });
  });

  describe('habits', async () => {
    beforeEach(async () => {
      const habit = {
        text: 'test habit',
        type: 'habit',
      };

      const task = new Tasks.habit(Tasks.Task.sanitize(habit)); // eslint-disable-line new-cap
      tasksByType.habits = [];
      tasksByType.habits.push(task);
    });

    it('should decrement only up value', async () => {
      tasksByType.habits[0].value = 1;
      tasksByType.habits[0].down = false;

      await cron({
        user, tasksByType, daysMissed, analytics,
      });

      expect(tasksByType.habits[0].value).to.be.lessThan(1);
    });

    it('should decrement only down value', async () => {
      tasksByType.habits[0].value = 1;
      tasksByType.habits[0].up = false;

      await cron({
        user, tasksByType, daysMissed, analytics,
      });

      expect(tasksByType.habits[0].value).to.be.lessThan(1);
    });

    it('should do nothing to habits with both up and down', async () => {
      tasksByType.habits[0].value = 1;
      tasksByType.habits[0].up = true;
      tasksByType.habits[0].down = true;

      await cron({
        user, tasksByType, daysMissed, analytics,
      });

      expect(tasksByType.habits[0].value).to.equal(1);
    });

    describe('counters', async () => {
      const notStartOfWeekOrMonth = new Date(2016, 9, 28).getTime(); // a Friday

      beforeEach(async () => {
        // Replace system clocks so we can get predictable results
        clock = sinon.useFakeTimers(notStartOfWeekOrMonth);
      });

      it('should reset a daily habit counter each day', async () => {
        tasksByType.habits[0].counterUp = 1;
        tasksByType.habits[0].counterDown = 1;

        await cron({
          user, tasksByType, daysMissed, analytics,
        });

        expect(tasksByType.habits[0].counterUp).to.equal(0);
        expect(tasksByType.habits[0].counterDown).to.equal(0);
      });

      it('should reset habit counters even if user is sleeping', async () => {
        user.preferences.sleep = true;
        tasksByType.habits[0].counterUp = 1;
        tasksByType.habits[0].counterDown = 1;

        await cron({
          user, tasksByType, daysMissed, analytics,
        });

        expect(tasksByType.habits[0].counterUp).to.equal(0);
        expect(tasksByType.habits[0].counterDown).to.equal(0);
      });

      it('should reset a weekly habit counter each Monday', async () => {
        tasksByType.habits[0].frequency = 'weekly';
        tasksByType.habits[0].counterUp = 1;
        tasksByType.habits[0].counterDown = 1;

        // should not reset
        await cron({
          user, tasksByType, daysMissed, analytics,
        });

        expect(tasksByType.habits[0].counterUp).to.equal(1);
        expect(tasksByType.habits[0].counterDown).to.equal(1);

        // should reset
        daysMissed = 8;
        await cron({
          user, tasksByType, daysMissed, analytics,
        });

        expect(tasksByType.habits[0].counterUp).to.equal(0);
        expect(tasksByType.habits[0].counterDown).to.equal(0);
      });

      it('should reset a weekly habit counter with custom daily start', async () => {
        clock.restore();

        // Server clock: Monday 12am UTC
        let monday = new Date('May 22, 2017 00:00:00 GMT').getTime();
        clock = sinon.useFakeTimers(monday);

        // cron runs at 2am
        user.preferences.dayStart = 2;

        tasksByType.habits[0].frequency = 'weekly';
        tasksByType.habits[0].counterUp = 1;
        tasksByType.habits[0].counterDown = 1;
        daysMissed = 1;

        // should not reset
        await cron({
          user, tasksByType, daysMissed, analytics,
        });

        expect(tasksByType.habits[0].counterUp).to.equal(1);
        expect(tasksByType.habits[0].counterDown).to.equal(1);

        clock.restore();

        // Server clock: Monday 3am UTC
        monday = new Date('May 22, 2017 03:00:00 GMT').getTime();
        clock = sinon.useFakeTimers(monday);

        // should reset after user CDS
        await cron({
          user, tasksByType, daysMissed, analytics,
        });

        expect(tasksByType.habits[0].counterUp).to.equal(0);
        expect(tasksByType.habits[0].counterDown).to.equal(0);
      });

      it('should not reset a weekly habit counter when server tz is Monday but user\'s tz is Tuesday', async () => {
        clock.restore();

        // Server clock: Monday 11pm UTC
        const monday = new Date('May 22, 2017 23:00:00 GMT').getTime();
        clock = sinon.useFakeTimers(monday);

        // User clock: Tuesday 1am UTC + 2
        user.preferences.timezoneOffset = -120;

        tasksByType.habits[0].frequency = 'weekly';
        tasksByType.habits[0].counterUp = 1;
        tasksByType.habits[0].counterDown = 1;
        daysMissed = 1;

        // should not reset
        await cron({
          user, tasksByType, daysMissed, analytics,
        });

        expect(tasksByType.habits[0].counterUp).to.equal(1);
        expect(tasksByType.habits[0].counterDown).to.equal(1);

        // User missed one cron, which will subtract User clock back to Monday 1am UTC + 2
        // should reset
        daysMissed = 2;
        await cron({
          user, tasksByType, daysMissed, analytics,
        });

        expect(tasksByType.habits[0].counterUp).to.equal(0);
        expect(tasksByType.habits[0].counterDown).to.equal(0);
      });

      it('should reset a weekly habit counter when server tz is Sunday but user\'s tz is Monday', async () => {
        clock.restore();

        // Server clock: Sunday 11pm UTC
        const sunday = new Date('May 21, 2017 23:00:00 GMT').getTime();
        clock = sinon.useFakeTimers(sunday);

        // User clock: Monday 2am UTC + 3
        user.preferences.timezoneOffset = -180;

        tasksByType.habits[0].frequency = 'weekly';
        tasksByType.habits[0].counterUp = 1;
        tasksByType.habits[0].counterDown = 1;
        daysMissed = 1;

        // should reset
        await cron({
          user, tasksByType, daysMissed, analytics,
        });

        expect(tasksByType.habits[0].counterUp).to.equal(0);
        expect(tasksByType.habits[0].counterDown).to.equal(0);
      });

      it('should not reset a weekly habit counter when server tz is Monday but user\'s tz is Sunday', async () => {
        clock.restore();

        // Server clock: Monday 2am UTC
        const monday = new Date('May 22, 2017 02:00:00 GMT').getTime();
        clock = sinon.useFakeTimers(monday);

        // User clock: Sunday 11pm UTC - 3
        user.preferences.timezoneOffset = 180;

        tasksByType.habits[0].frequency = 'weekly';
        tasksByType.habits[0].counterUp = 1;
        tasksByType.habits[0].counterDown = 1;
        daysMissed = 1;

        // should not reset
        await cron({
          user, tasksByType, daysMissed, analytics,
        });

        expect(tasksByType.habits[0].counterUp).to.equal(1);
        expect(tasksByType.habits[0].counterDown).to.equal(1);
      });

      it('should reset a monthly habit counter the first day of each month', async () => {
        tasksByType.habits[0].frequency = 'monthly';
        tasksByType.habits[0].counterUp = 1;
        tasksByType.habits[0].counterDown = 1;

        // should not reset
        await cron({
          user, tasksByType, daysMissed, analytics,
        });

        expect(tasksByType.habits[0].counterUp).to.equal(1);
        expect(tasksByType.habits[0].counterDown).to.equal(1);

        // should reset
        daysMissed = 32;
        await cron({
          user, tasksByType, daysMissed, analytics,
        });

        expect(tasksByType.habits[0].counterUp).to.equal(0);
        expect(tasksByType.habits[0].counterDown).to.equal(0);
      });

      it('should reset a monthly habit counter when server tz is last day of month but user tz is first day of the month', async () => {
        clock.restore();
        daysMissed = 0;

        // Server clock: 4/30/17 11pm UTC
        const monday = new Date('April 30, 2017 23:00:00 GMT').getTime();
        clock = sinon.useFakeTimers(monday);

        // User clock: 5/1/17 2am UTC + 3
        user.preferences.timezoneOffset = -180;

        tasksByType.habits[0].frequency = 'monthly';
        tasksByType.habits[0].counterUp = 1;
        tasksByType.habits[0].counterDown = 1;
        daysMissed = 1;

        // should reset
        await cron({
          user, tasksByType, daysMissed, analytics,
        });

        expect(tasksByType.habits[0].counterUp).to.equal(0);
        expect(tasksByType.habits[0].counterDown).to.equal(0);
      });

      it('should not reset a monthly habit counter when server tz is first day of month but user tz is 2nd day of the month', async () => {
        clock.restore();

        // Server clock: 5/1/17 11pm UTC
        const monday = new Date('May 1, 2017 23:00:00 GMT').getTime();
        clock = sinon.useFakeTimers(monday);

        // User clock: 5/2/17 2am UTC + 3
        user.preferences.timezoneOffset = -180;

        tasksByType.habits[0].frequency = 'monthly';
        tasksByType.habits[0].counterUp = 1;
        tasksByType.habits[0].counterDown = 1;
        daysMissed = 1;

        // should not reset
        await cron({
          user, tasksByType, daysMissed, analytics,
        });

        expect(tasksByType.habits[0].counterUp).to.equal(1);
        expect(tasksByType.habits[0].counterDown).to.equal(1);

        // User missed one day, which will subtract User clock back to 5/1/17 2am UTC + 3
        // should reset
        daysMissed = 2;
        await cron({
          user, tasksByType, daysMissed, analytics,
        });

        expect(tasksByType.habits[0].counterUp).to.equal(0);
        expect(tasksByType.habits[0].counterDown).to.equal(0);
      });
    });
  });

  describe('perfect day', async () => {
    beforeEach(async () => {
      const daily = {
        text: 'test daily',
        type: 'daily',
      };

      const task = new Tasks.daily(Tasks.Task.sanitize(daily)); // eslint-disable-line new-cap
      tasksByType.dailys = [];
      tasksByType.dailys.push(task);

      const statsComputedRes = common.statsComputed(user);
      const stubbedStatsComputed = sinon.stub(common, 'statsComputed');
      stubbedStatsComputed.returns(Object.assign(statsComputedRes, { con: 1 }));
    });

    afterEach(async () => {
      common.statsComputed.restore();
    });

    it('stores a new entry in user.history.exp', async () => {
      user.stats.lvl = 2;

      await cron({
        user, tasksByType, daysMissed, analytics,
      });

      expect(user.history.exp).to.have.lengthOf(1);
      expect(user.history.exp[0].value).to.equal(25);
    });

    it('increments perfect day achievement if all (at least 1) due dailies were completed', async () => {
      daysMissed = 1;
      tasksByType.dailys[0].completed = true;
      tasksByType.dailys[0].isDue = true;

      await cron({
        user, tasksByType, daysMissed, analytics,
      });

      expect(user.achievements.perfect).to.equal(1);
    });

    it('does not increment perfect day achievement if no due dailies', async () => {
      daysMissed = 1;
      tasksByType.dailys[0].completed = true;
      tasksByType.dailys[0].isDue = false;

      await cron({
        user, tasksByType, daysMissed, analytics,
      });

      expect(user.achievements.perfect).to.equal(0);
    });

    it('gives perfect day buff if all (at least 1) due dailies were completed', async () => {
      daysMissed = 1;
      tasksByType.dailys[0].completed = true;
      tasksByType.dailys[0].isDue = true;

      const previousBuffs = user.stats.buffs.toObject();

      await cron({
        user, tasksByType, daysMissed, analytics,
      });

      expect(user.stats.buffs.str).to.be.greaterThan(previousBuffs.str);
      expect(user.stats.buffs.int).to.be.greaterThan(previousBuffs.int);
      expect(user.stats.buffs.per).to.be.greaterThan(previousBuffs.per);
      expect(user.stats.buffs.con).to.be.greaterThan(previousBuffs.con);
    });

    it('gives perfect day buff if all (at least 1) due dailies were completed when user is sleeping', async () => {
      user.preferences.sleep = true;
      daysMissed = 1;
      tasksByType.dailys[0].completed = true;
      tasksByType.dailys[0].isDue = true;

      const previousBuffs = user.stats.buffs.toObject();

      await cron({
        user, tasksByType, daysMissed, analytics,
      });

      expect(user.stats.buffs.str).to.be.greaterThan(previousBuffs.str);
      expect(user.stats.buffs.int).to.be.greaterThan(previousBuffs.int);
      expect(user.stats.buffs.per).to.be.greaterThan(previousBuffs.per);
      expect(user.stats.buffs.con).to.be.greaterThan(previousBuffs.con);
    });

    it('clears buffs if user does not have a perfect day (no due dailys)', async () => {
      daysMissed = 1;
      tasksByType.dailys[0].completed = true;
      tasksByType.dailys[0].isDue = false;

      user.stats.buffs = {
        str: 1,
        int: 1,
        per: 1,
        con: 1,
        stealth: 0,
        streaks: true,
      };

      await cron({
        user, tasksByType, daysMissed, analytics,
      });

      expect(user.stats.buffs.str).to.equal(0);
      expect(user.stats.buffs.int).to.equal(0);
      expect(user.stats.buffs.per).to.equal(0);
      expect(user.stats.buffs.con).to.equal(0);
      expect(user.stats.buffs.stealth).to.equal(0);
      expect(user.stats.buffs.streaks).to.be.false;
    });

    it('clears buffs if user does not have a perfect day (no due dailys) when user is sleeping', async () => {
      user.preferences.sleep = true;
      daysMissed = 1;
      tasksByType.dailys[0].completed = true;
      tasksByType.dailys[0].startDate = moment(new Date()).add({ days: 1 });

      user.stats.buffs = {
        str: 1,
        int: 1,
        per: 1,
        con: 1,
        stealth: 0,
        streaks: true,
      };

      await cron({
        user, tasksByType, daysMissed, analytics,
      });

      expect(user.stats.buffs.str).to.equal(0);
      expect(user.stats.buffs.int).to.equal(0);
      expect(user.stats.buffs.per).to.equal(0);
      expect(user.stats.buffs.con).to.equal(0);
      expect(user.stats.buffs.stealth).to.equal(0);
      expect(user.stats.buffs.streaks).to.be.false;
    });

    it('clears buffs if user does not have a perfect day (at least one due daily not completed)', async () => {
      daysMissed = 1;
      tasksByType.dailys[0].completed = false;
      tasksByType.dailys[0].startDate = moment(new Date()).subtract({ days: 1 });

      user.stats.buffs = {
        str: 1,
        int: 1,
        per: 1,
        con: 1,
        stealth: 0,
        streaks: true,
      };

      await cron({
        user, tasksByType, daysMissed, analytics,
      });

      expect(user.stats.buffs.str).to.equal(0);
      expect(user.stats.buffs.int).to.equal(0);
      expect(user.stats.buffs.per).to.equal(0);
      expect(user.stats.buffs.con).to.equal(0);
      expect(user.stats.buffs.stealth).to.equal(0);
      expect(user.stats.buffs.streaks).to.be.false;
    });

    it('clears buffs if user does not have a perfect day (at least one due daily not completed) when user is sleeping', async () => {
      user.preferences.sleep = true;
      daysMissed = 1;
      tasksByType.dailys[0].completed = false;
      tasksByType.dailys[0].startDate = moment(new Date()).subtract({ days: 1 });

      user.stats.buffs = {
        str: 1,
        int: 1,
        per: 1,
        con: 1,
        stealth: 0,
        streaks: true,
      };

      await cron({
        user, tasksByType, daysMissed, analytics,
      });

      expect(user.stats.buffs.str).to.equal(0);
      expect(user.stats.buffs.int).to.equal(0);
      expect(user.stats.buffs.per).to.equal(0);
      expect(user.stats.buffs.con).to.equal(0);
      expect(user.stats.buffs.stealth).to.equal(0);
      expect(user.stats.buffs.streaks).to.be.false;
    });

    it('always grants a perfect day buff when CRON_SAFE_MODE is set', async () => {
      sandbox.stub(nconf, 'get').withArgs('CRON_SAFE_MODE').returns('true');
      const cronOverride = requireAgain(pathToCronLib).cron;
      daysMissed = 1;
      tasksByType.dailys[0].completed = false;
      tasksByType.dailys[0].startDate = moment(new Date()).subtract({ days: 1 });

      const previousBuffs = user.stats.buffs.toObject();

      cronOverride({
        user, tasksByType, daysMissed, analytics,
      });

      expect(user.stats.buffs.str).to.be.greaterThan(previousBuffs.str);
      expect(user.stats.buffs.int).to.be.greaterThan(previousBuffs.int);
      expect(user.stats.buffs.per).to.be.greaterThan(previousBuffs.per);
      expect(user.stats.buffs.con).to.be.greaterThan(previousBuffs.con);
    });

    it('always grants a perfect day buff when CRON_SAFE_MODE is set when user is sleeping', async () => {
      user.preferences.sleep = true;
      sandbox.stub(nconf, 'get').withArgs('CRON_SAFE_MODE').returns('true');
      const cronOverride = requireAgain(pathToCronLib).cron;
      daysMissed = 1;
      tasksByType.dailys[0].completed = false;
      tasksByType.dailys[0].startDate = moment(new Date()).subtract({ days: 1 });

      const previousBuffs = user.stats.buffs.toObject();

      cronOverride({
        user, tasksByType, daysMissed, analytics,
      });

      expect(user.stats.buffs.str).to.be.greaterThan(previousBuffs.str);
      expect(user.stats.buffs.int).to.be.greaterThan(previousBuffs.int);
      expect(user.stats.buffs.per).to.be.greaterThan(previousBuffs.per);
      expect(user.stats.buffs.con).to.be.greaterThan(previousBuffs.con);
    });
  });

  describe('adding mp', async () => {
    it('should add mp to user', async () => {
      const statsComputedRes = common.statsComputed(user);
      const stubbedStatsComputed = sinon.stub(common, 'statsComputed');

      const mpBefore = user.stats.mp;
      tasksByType.dailys[0].completed = true;
      stubbedStatsComputed.returns(Object.assign(statsComputedRes, { maxMP: 100 }));
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.stats.mp).to.be.greaterThan(mpBefore);

      common.statsComputed.restore();
    });

    it('should not add mp to user when user is sleeping', async () => {
      const statsComputedRes = common.statsComputed(user);
      const stubbedStatsComputed = sinon.stub(common, 'statsComputed');

      user.preferences.sleep = true;
      const mpBefore = user.stats.mp;
      tasksByType.dailys[0].completed = true;
      stubbedStatsComputed.returns(Object.assign(statsComputedRes, { maxMP: 100 }));
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.stats.mp).to.equal(mpBefore);

      common.statsComputed.restore();
    });

    it('set user\'s mp to statsComputed.maxMP when user.stats.mp is greater', async () => {
      const statsComputedRes = common.statsComputed(user);
      const stubbedStatsComputed = sinon.stub(common, 'statsComputed');
      user.stats.mp = 120;
      stubbedStatsComputed.returns(Object.assign(statsComputedRes, { maxMP: 100 }));
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.stats.mp).to.equal(common.statsComputed(user).maxMP);

      common.statsComputed.restore();
    });
  });

  describe('quest progress', async () => {
    beforeEach(async () => {
      const daily = {
        text: 'test daily',
        type: 'daily',
      };

      const task = new Tasks.daily(Tasks.Task.sanitize(daily)); // eslint-disable-line new-cap
      tasksByType.dailys = [];
      tasksByType.dailys.push(task);

      const statsComputedRes = common.statsComputed(user);
      const stubbedStatsComputed = sinon.stub(common, 'statsComputed');
      stubbedStatsComputed.returns(Object.assign(statsComputedRes, { con: 1 }));

      daysMissed = 1;
      tasksByType.dailys[0].startDate = moment(new Date()).subtract({ days: 1 });
    });

    afterEach(async () => {
      common.statsComputed.restore();
    });

    it('resets user progress', async () => {
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.party.quest.progress.up).to.equal(0);
      expect(user.party.quest.progress.down).to.equal(0);
      expect(user.party.quest.progress.collectedItems).to.equal(0);
    });

    it('applies the user progress', async () => {
      const progress = await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(progress.down).to.equal(-1);
    });
  });

  describe('private messages', async () => {
    let lastMessageId;

    beforeEach(async () => {
      const maxPMs = 200;
      for (let index = 0; index < maxPMs - 1; index += 1) {
        const messageId = common.uuid();
        user.inbox.messages[messageId] = {
          id: messageId,
          text: `test ${index}`,
          timestamp: Number(new Date()),
          likes: {},
          flags: {},
          flagCount: 0,
        };
      }

      lastMessageId = common.uuid();
      user.inbox.messages[lastMessageId] = {
        id: lastMessageId,
        text: `test ${lastMessageId}`,
        timestamp: Number(new Date()),
        likes: {},
        flags: {},
        flagCount: 0,
      };
    });
  });

  describe('login incentives', async () => {
    it('increments incentive counter each cron', async () => {
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.loginIncentives).to.eql(1);
      user.lastCron = moment(new Date()).subtract({ days: 1 });
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.loginIncentives).to.eql(2);
    });

    it('pushes a notification of the day\'s incentive each cron', async () => {
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.notifications.length).to.eql(1);
      expect(user.notifications[0].type).to.eql('LOGIN_INCENTIVE');
    });

    it('replaces previous notifications', async () => {
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      await cron({
        user, tasksByType, daysMissed, analytics,
      });

      const filteredNotifications = user.notifications.filter(n => n.type === 'LOGIN_INCENTIVE');

      expect(filteredNotifications.length).to.equal(1);
    });

    it('increments loginIncentives by 1 even if days are skipped in between', async () => {
      daysMissed = 3;
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.loginIncentives).to.eql(1);
    });

    it('increments loginIncentives by 1 even if user is sleeping', async () => {
      user.preferences.sleep = true;
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.loginIncentives).to.eql(1);
    });

    it('awards user bard robes if login incentive is 1', async () => {
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.loginIncentives).to.eql(1);
      expect(user.items.gear.owned.armor_special_bardRobes).to.eql(true);
      expect(user.notifications[0].type).to.eql('LOGIN_INCENTIVE');
    });

    it('awards user incentive backgrounds if login incentive is 2', async () => {
      user.loginIncentives = 1;
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.loginIncentives).to.eql(2);
      expect(user.purchased.background.blue).to.eql(true);
      expect(user.purchased.background.green).to.eql(true);
      expect(user.purchased.background.purple).to.eql(true);
      expect(user.purchased.background.red).to.eql(true);
      expect(user.purchased.background.yellow).to.eql(true);
      expect(user.notifications[0].type).to.eql('LOGIN_INCENTIVE');
    });

    it('awards user Bard Hat if login incentive is 3', async () => {
      user.loginIncentives = 2;
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.loginIncentives).to.eql(3);
      expect(user.items.gear.owned.head_special_bardHat).to.eql(true);
      expect(user.notifications[0].type).to.eql('LOGIN_INCENTIVE');
    });

    it('awards user RoyalPurple Hatching Potion if login incentive is 4', async () => {
      user.loginIncentives = 3;
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.loginIncentives).to.eql(4);
      expect(user.items.hatchingPotions.RoyalPurple).to.eql(1);
      expect(user.notifications[0].type).to.eql('LOGIN_INCENTIVE');
    });

    it('awards user a Chocolate, Meat and Pink Contton Candy if login incentive is 5', async () => {
      user.loginIncentives = 4;
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.loginIncentives).to.eql(5);

      expect(user.items.food.Chocolate).to.eql(1);
      expect(user.items.food.Meat).to.eql(1);
      expect(user.items.food.CottonCandyPink).to.eql(1);

      expect(user.notifications[0].type).to.eql('LOGIN_INCENTIVE');
    });

    it('awards user moon quest if login incentive is 7', async () => {
      user.loginIncentives = 6;
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.loginIncentives).to.eql(7);
      expect(user.items.quests.moon1).to.eql(1);
      expect(user.notifications[0].type).to.eql('LOGIN_INCENTIVE');
    });

    it('awards user RoyalPurple Hatching Potion if login incentive is 10', async () => {
      user.loginIncentives = 9;
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.loginIncentives).to.eql(10);
      expect(user.items.hatchingPotions.RoyalPurple).to.eql(1);
      expect(user.notifications[0].type).to.eql('LOGIN_INCENTIVE');
    });

    it('awards user a Strawberry, Patato and Blue Contton Candy if login incentive is 14', async () => {
      user.loginIncentives = 13;
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.loginIncentives).to.eql(14);

      expect(user.items.food.Strawberry).to.eql(1);
      expect(user.items.food.Potatoe).to.eql(1);
      expect(user.items.food.CottonCandyBlue).to.eql(1);

      expect(user.notifications[0].type).to.eql('LOGIN_INCENTIVE');
    });

    it('awards user a bard instrument if login incentive is 18', async () => {
      user.loginIncentives = 17;
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.loginIncentives).to.eql(18);
      expect(user.items.gear.owned.weapon_special_bardInstrument).to.eql(true);
      expect(user.notifications[0].type).to.eql('LOGIN_INCENTIVE');
    });

    it('awards user second moon quest if login incentive is 22', async () => {
      user.loginIncentives = 21;
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.loginIncentives).to.eql(22);
      expect(user.items.quests.moon2).to.eql(1);
      expect(user.notifications[0].type).to.eql('LOGIN_INCENTIVE');
    });

    it('awards user a RoyalPurple hatching potion if login incentive is 26', async () => {
      user.loginIncentives = 25;
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.loginIncentives).to.eql(26);
      expect(user.items.hatchingPotions.RoyalPurple).to.eql(1);
      expect(user.notifications[0].type).to.eql('LOGIN_INCENTIVE');
    });

    it('awards user Fish, Milk, Rotten Meat and Honey if login incentive is 30', async () => {
      user.loginIncentives = 29;
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.loginIncentives).to.eql(30);

      expect(user.items.food.Fish).to.eql(1);
      expect(user.items.food.Milk).to.eql(1);
      expect(user.items.food.RottenMeat).to.eql(1);
      expect(user.items.food.Honey).to.eql(1);

      expect(user.notifications[0].type).to.eql('LOGIN_INCENTIVE');
    });

    it('awards user a RoyalPurple hatching potion if login incentive is 35', async () => {
      user.loginIncentives = 34;
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.loginIncentives).to.eql(35);
      expect(user.items.hatchingPotions.RoyalPurple).to.eql(1);
      expect(user.notifications[0].type).to.eql('LOGIN_INCENTIVE');
    });

    it('awards user the third moon quest if login incentive is 40', async () => {
      user.loginIncentives = 39;
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.loginIncentives).to.eql(40);
      expect(user.items.quests.moon3).to.eql(1);
      expect(user.notifications[0].type).to.eql('LOGIN_INCENTIVE');
    });

    it('awards user a RoyalPurple hatching potion if login incentive is 45', async () => {
      user.loginIncentives = 44;
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.loginIncentives).to.eql(45);
      expect(user.items.hatchingPotions.RoyalPurple).to.eql(1);
      expect(user.notifications[0].type).to.eql('LOGIN_INCENTIVE');
    });

    it('awards user a saddle if login incentive is 50', async () => {
      user.loginIncentives = 49;
      await cron({
        user, tasksByType, daysMissed, analytics,
      });
      expect(user.loginIncentives).to.eql(50);
      expect(user.items.food.Saddle).to.eql(1);
      expect(user.notifications[0].type).to.eql('LOGIN_INCENTIVE');
    });
  });
});

describe('cron wrapper', () => {
  let res; let
    req;
  let user;

  beforeEach(async () => {
    res = generateRes();
    req = generateReq();
    user = await res.locals.user.save();
    res.analytics = analytics;
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('calls next when user is not attached', async () => {
    res.locals.user = null;
    await cronWrapper(req, res);
  });

  it('calls next when days have not been missed', async () => {
    await cronWrapper(req, res);
  });

  it('should clear todos older than 30 days for free users', async () => {
    user.lastCron = moment(new Date()).subtract({ days: 2 });
    const task = generateTodo(user);
    task.dateCompleted = moment(new Date()).subtract({ days: 31 });
    task.completed = true;
    await task.save();
    await user.save();

    await cronWrapper(req, res);
    const taskRes = await Tasks.Task.findOne({ _id: task._id });
    expect(taskRes).to.not.exist;
  });

  it('should not clear todos older than 30 days for subscribed users', async () => {
    user.purchased.plan.customerId = 'subscribedId';
    user.purchased.plan.dateUpdated = moment('012013', 'MMYYYY');
    user.lastCron = moment(new Date()).subtract({ days: 2 });
    const task = generateTodo(user);
    task.dateCompleted = moment(new Date()).subtract({ days: 31 });
    task.completed = true;
    await Promise.all([task.save(), user.save()]);

    await cronWrapper(req, res);
    const taskRes = await Tasks.Task.findOne({ _id: task._id });
    expect(taskRes).to.exist;
  });

  it('should clear todos older than 90 days for subscribed users', async () => {
    user.purchased.plan.customerId = 'subscribedId';
    user.purchased.plan.dateUpdated = moment('012013', 'MMYYYY');
    user.lastCron = moment(new Date()).subtract({ days: 2 });

    const task = generateTodo(user);
    task.dateCompleted = moment(new Date()).subtract({ days: 91 });
    task.completed = true;
    await task.save();
    await user.save();

    await cronWrapper(req, res);
    const taskRes = await Tasks.Task.findOne({ _id: task._id });
    expect(taskRes).to.not.exist;
  });

  it('should call next if user was not modified after cron', async () => {
    const hpBefore = user.stats.hp;
    user.lastCron = moment(new Date()).subtract({ days: 2 });
    await user.save();

    await cronWrapper(req, res);
    expect(hpBefore).to.equal(user.stats.hp);
  });

  it('runs cron if previous cron was incomplete', async () => {
    user.lastCron = moment(new Date()).subtract({ days: 1 });
    user.auth.timestamps.loggedin = moment(new Date()).subtract({ days: 4 });
    const now = new Date();
    await user.save();

    await cronWrapper(req, res);
    expect(moment(now).isSame(user.lastCron, 'day'));
    expect(moment(now).isSame(user.auth.timestamps.loggedin, 'day'));
  });

  it('updates user.auth.timestamps.loggedin and lastCron', async () => {
    user.lastCron = moment(new Date()).subtract({ days: 2 });
    const now = new Date();
    await user.save();

    await cronWrapper(req, res);
    expect(moment(now).isSame(user.lastCron, 'day'));
    expect(moment(now).isSame(user.auth.timestamps.loggedin, 'day'));
  });

  it('does damage for missing dailies', async () => {
    const hpBefore = user.stats.hp;
    user.lastCron = moment(new Date()).subtract({ days: 2 });
    const daily = generateDaily(user);
    daily.startDate = moment(new Date()).subtract({ days: 2 });
    await daily.save();
    await user.save();

    await cronWrapper(req, res);
    const updatedUser = await User.findOne({ _id: user._id });
    expect(updatedUser.stats.hp).to.be.lessThan(hpBefore);
  });

  it('updates tasks', async () => {
    user.lastCron = moment(new Date()).subtract({ days: 2 });
    const todo = generateTodo(user);
    const todoValueBefore = todo.value;
    await Promise.all([todo.save(), user.save()]);

    await cronWrapper(req, res);
    const todoFound = await Tasks.Task.findOne({ _id: todo._id });
    expect(todoFound.value).to.be.lessThan(todoValueBefore);
  });

  it('updates large number of tasks', async () => {
    user.lastCron = moment(new Date()).subtract({ days: 2 });
    const todo = generateTodo(user);
    const todoValueBefore = todo.value;
    const start = new Date();
    const saves = [todo.save(), user.save()];
    for (let i = 0; i < 200; i += 1) {
      const newTodo = generateTodo(user);
      newTodo.value = i;
      saves.push(newTodo.save());
    }
    await Promise.all(saves);

    await cronWrapper(req, res);
    const duration = new Date() - start;
    expect(duration).to.be.lessThan(1000);
    const todoFound = await Tasks.Task.findOne({ _id: todo._id });
    expect(moment(start).isSame(user.lastCron, 'day'));
    expect(moment(start).isSame(user.auth.timestamps.loggedin, 'day'));
    expect(todoFound.value).to.be.lessThan(todoValueBefore);
  });

  it('fails entire cron if one task is failing', async () => {
    const lastCron = moment(new Date()).subtract({ days: 2 });
    user.lastCron = lastCron;
    const todo = generateTodo(user);
    const todoValueBefore = todo.value;
    const badTodo = generateTodo(user);
    badTodo.text = 'bad todo';
    badTodo.attribute = 'bad';
    await Promise.all([badTodo.save({ validateBeforeSave: false }), todo.save(), user.save()]);

    try {
      await cronWrapper(req, res);
    } catch (err) {
      expect(err).to.exist;
    }
    const todoFound = await Tasks.Task.findOne({ _id: todo._id });
    expect(moment(lastCron).isSame(user.lastCron, 'day'));
    expect(todoFound.value).to.be.equal(todoValueBefore);
  });

  it('applies quest progress', async () => {
    const hpBefore = user.stats.hp;
    user.lastCron = moment(new Date()).subtract({ days: 2 });
    const daily = generateDaily(user);
    daily.startDate = moment(new Date()).subtract({ days: 2 });
    await daily.save();

    const questKey = 'dilatory';
    user.party.quest.key = questKey;

    const party = new Group({
      type: 'party',
      name: generateUUID(),
      leader: user._id,
    });
    party.quest.members[user._id] = true;
    party.quest.key = questKey;
    await party.save();

    user.party._id = party._id;
    await user.save();

    party.startQuest(user);

    await cronWrapper(req, res);
    const updatedUser = await User.findOne({ _id: user._id });
    expect(updatedUser.stats.hp).to.be.lessThan(hpBefore);
  });

  it('cronSignature less than 5 minutes ago should error', async () => {
    user.lastCron = moment(new Date()).subtract({ days: 2 });
    const now = new Date();
    await User.updateOne({
      _id: user._id,
    }, {
      $set: {
        _cronSignature: now.getTime() - CRON_TIMEOUT_WAIT + CRON_TIMEOUT_UNIT,
      },
    }).exec();
    await user.save();
    try {
      await cronWrapper(req, res);
    } catch (err) {
      expect(err).to.exist;
    }
  });

  it('cronSignature longer than an hour ago should allow cron', async () => {
    user.lastCron = moment(new Date()).subtract({ days: 2 });
    const now = new Date();
    await User.updateOne({
      _id: user._id,
    }, {
      $set: {
        _cronSignature: now.getTime() - CRON_TIMEOUT_WAIT - CRON_TIMEOUT_UNIT,
      },
    }).exec();
    await user.save();

    await cronWrapper(req, res);
    expect(moment(now).isSame(user.auth.timestamps.loggedin, 'day'));
    expect(user._cronSignature).to.be.equal('NOT_RUNNING');
  });

  it('cron should not run more than once', async () => {
    user.lastCron = moment(new Date()).subtract({ days: 2 });
    await user.save();

    const result = await Promise.allSettled([
      cronWrapper(req, res),
      cronWrapper(req, res),
      new Promise((resolve, reject) => {
        setTimeout(async () => {
          try {
            const runResult = await cronWrapper(req, res);
            if (runResult !== null) {
              reject(new Error('cron ran more than once'));
            } else {
              resolve();
            }
          } catch (err) {
            reject(err);
          }
        }, 200);
      }),
    ]);

    expect(result.filter(r => r.status === 'fulfilled')).to.have.lengthOf(2);
    expect(result.filter(r => r.status === 'rejected')).to.have.lengthOf(1);
  });
});
