<template>
  <form
    @submit.prevent="saveHero({ hero: {
      _id: hero._id,
      purchased: hero.purchased
    }, msg: 'Subscription Perks' })"
  >
    <div class="card mt-2">
      <div class="card-header"
          @click="expand = !expand">
        <h3
          class="mb-0 mt-0"
          :class="{ 'open': expand }"
        >
          Subscription, Monthly Perks
        <b v-if="hasUnsavedChanges && !expand" class="text-warning float-right">
          Unsaved changes
        </b>
        </h3>
      </div>
      <div
        v-if="expand"
        class="card-body"
      >
      <div
          class="form-group row"
        >
          <label class="col-sm-3 col-form-label">
            Payment method:
          </label>
          <div class="col-sm-9">
            <input v-model="hero.purchased.plan.paymentMethod"
              class="form-control"
              type="text"
              v-if="!isRegularPaymentMethod"
            >
              <select
              v-else
                v-model="hero.purchased.plan.paymentMethod"
                class="form-control"
                type="text"
              >
                <option value="groupPlan">Group Plan</option>
                <option value="Stripe">Stripe</option>
                <option value="Apple">Apple</option>
                <option value="Google">Google</option>
                <option value="Amazon Payments">Amazon</option>
                <option value="PayPal">PayPal</option>
                <option value="Gift">Gift</option>
                <option value="">Clear out</option>
              </select>
          </div>
        </div>
        <div
          class="form-group row"
        >
          <label class="col-sm-3 col-form-label">
            Payment schedule:
          </label>
          <div class="col-sm-9">
            <input v-model="hero.purchased.plan.planId"
              class="form-control"
              type="text"
              v-if="!isRegularPlanId"
            >
              <select
              v-else
                v-model="hero.purchased.plan.planId"
                class="form-control"
                type="text"
              >
                <option value="basic_earned">Monthly recurring</option>
                <option value="basic_3mo">3 Months recurring</option>
                <option value="basic_6mo">6 Months recurring</option>
                <option value="basic_12mo">12 Months recurring</option>
                <option value="group_monthly">Group Plan (legacy)</option>
                <option value="group_plan_auto">Group Plan (auto)</option>
                <option value="">Clear out</option>
              </select>
          </div>
        </div>
        <div
          class="form-group row"
        >
          <label class="col-sm-3 col-form-label">
            Customer ID:
          </label>
          <div class="col-sm-9">
              <input
                v-model="hero.purchased.plan.customerId"
                class="form-control"
                type="text"
              >
          </div>
        </div>
        <div class="form-group row"
          v-if="hero.purchased.plan.planId === 'group_plan_auto'">
          <label class="col-sm-3 col-form-label">
            Group Plan Memberships:
          </label>
          <div class="col-sm-9 col-form-label">
            <loading-spinner
                v-if="!groupPlans"
                dark-color=true
              />
            <b
            v-else-if="groupPlans.length === 0"
            class="text-danger col-form-label"
            >User is not part of an active group plan!</b>
            <div
            v-else
              v-for="group in groupPlans"
              :key="group._id"
              class="card mb-2">
              <div class="card-body">
                <h6 class="card-title">{{  group.name }}
                  <small class="float-right">{{ group._id }}</small>
                </h6>
                <p class="card-text">
                  <strong>Leader: </strong>
                <a
                v-if="group.leader !== hero._id"
                @click="switchUser(group.leader)"
                >{{ group.leader }}</a>
                <strong v-else class="text-success">This user</strong>
                </p>
                <p class="card-text">
                  <strong>Members: </strong> {{ group.memberCount }}
                </p>
              </div>
            </div>
          </div>
        </div>
        <div
          v-if="hero.purchased.plan.dateCreated"
          class="form-group row"
        >
          <label class="col-sm-3 col-form-label">
            Creation date:
          </label>
          <div class="col-sm-9">
            <div class="input-group">
              <input
                v-model="hero.purchased.plan.dateCreated"
                class="form-control"
                type="text"
              >
              <div class="input-group-append">
                <strong class="input-group-text">
                  {{ dateFormat(hero.purchased.plan.dateCreated) }}
                </strong>
              </div>
            </div>
          </div>
        </div>
        <div
          v-if="hero.purchased.plan.dateCurrentTypeCreated"
          class="form-group row"
        >
          <label class="col-sm-3 col-form-label">
            Current sub start date:
          </label>
          <div class="col-sm-9">
            <div class="input-group">
              <input
                v-model="hero.purchased.plan.dateCurrentTypeCreated"
                class="form-control"
                type="text"
              >
              <div class="input-group-append">
                <strong class="input-group-text">
                  {{ dateFormat(hero.purchased.plan.dateCurrentTypeCreated) }}
                </strong>
              </div>
            </div>
          </div>
        </div>
        <div class="form-group row">
          <label class="col-sm-3 col-form-label">
            Termination date:
          </label>
          <div class="col-sm-9">
            <div class="input-group">
              <input
                v-model="hero.purchased.plan.dateTerminated"
                class="form-control"
                type="text"
              >
              <div class="input-group-append">
                <strong class="input-group-text">
                  {{ dateFormat(hero.purchased.plan.dateTerminated) }}
                </strong>
                <a class="btn btn-danger"
              href="#"
                  v-b-modal.sub_termination_modal
                  v-if="!hero.purchased.plan.dateTerminated && hero.purchased.plan.planId">
                  Terminate
              </a>
              </div>
            </div>
            <small v-if="!hero.purchased.plan.dateTerminated
              && hero.purchased.plan.planId" class="text-success">
              The subscription does not have a termination date and is active.
            </small>
          </div>
        </div>
        <div class="form-group row">
          <label class="col-sm-3 col-form-label">
            Cumulative months:
          </label>
          <div class="col-sm-9">
            <input
              v-model="hero.purchased.plan.cumulativeCount"
              class="form-control"
              type="number"
              min="0"
              step="1"
            >
            <small class="text-secondary">
              Cumulative subscribed months across subscription periods.
            </small>
          </div>
        </div>
        <div class="form-group row">
          <label class="col-sm-3 col-form-label">
            Extra months:
          </label>
          <div class="col-sm-9">
            <div class="input-group">
              <input
                v-model="hero.purchased.plan.extraMonths"
                class="form-control"
                type="number"
                min="0"
                step="any"
              >
              <div class="input-group-append">
                <a class="btn btn-warning"
                  @click="applyExtraMonths"
                  v-if="hero.purchased.plan.dateTerminated && hero.purchased.plan.extraMonths > 0">
                  Apply Credit
              </a>
              </div>
            </div>
            <small class="text-secondary">
              Additional credit that is applied if a subscription is cancelled.
            </small>
          </div>
        </div>
        <div class="form-group row">
          <label class="col-sm-3 col-form-label">
            Received hourglass bonus:
          </label>
          <div class="col-sm-9">
            <div class="input-group">
              <input
                v-model="hero.purchased.plan.hourglassPromoReceived"
                class="form-control"
                type="text"
              >
              <div class="input-group-append">
                <strong class="input-group-text">
                  {{ dateFormat(hero.purchased.plan.hourglassPromoReceived) }}
                </strong>
              </div>
            </div>
          </div>
        </div>
        <div class="form-group row">
          <label class="col-sm-3 col-form-label">
            Mystic Hourglasses:
          </label>
          <div class="col-sm-9">
            <input
              v-model="hero.purchased.plan.consecutive.trinkets"
              class="form-control"
              type="number"
              min="0"
              step="1"
            >
          </div>
        </div>
        <div class="form-group row">
          <label class="col-sm-3 col-form-label">
            Gem cap increase:
          </label>
          <div class="col-sm-9">
            <input
              v-model="hero.purchased.plan.consecutive.gemCapExtra"
              class="form-control"
              type="number"
              min="0"
              max="26"
              step="2"
            >
          </div>
        </div>
        <div class="form-group row">
          <label class="col-sm-3 col-form-label">
            Total Gem cap:
          </label>
          <strong class="col-sm-9 col-form-label">
            {{ Number(hero.purchased.plan.consecutive.gemCapExtra) + 24 }}
          </strong>
        </div>
        <div class="form-group row">
          <label class="col-sm-3 col-form-label">
            Gems bought this month:
          </label>
          <div class="col-sm-9">
            <input
              v-model="hero.purchased.plan.gemsBought"
              class="form-control"
              type="number"
              min="0"
              :max="hero.purchased.plan.consecutive.gemCapExtra + 24"
              step="1"
            >
          </div>
        </div>
        <div class="form-group row">
          <label class="col-sm-3 col-form-label">
            Mystery Items:
          </label>
          <div class="col-sm-9 col-form-label">
            <span v-if="hero.purchased.plan.mysteryItems.length > 0">
              <span
                v-for="(item, index) in hero.purchased.plan.mysteryItems"
                :key="index"
              >
                <strong v-if="index < hero.purchased.plan.mysteryItems.length - 1">
                  {{ item }},
                </strong>
                <strong v-else> {{ item }} </strong>
              </span>
            </span>
            <span v-else>
              <strong>None</strong>
            </span>
          </div>
        </div>
        <div class="form-group row"
              v-if="!isConvertingToGroupPlan && hero.purchased.plan.planId !== 'group_plan_auto'">
          <div class="offset-sm-3 col-sm-9">
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              @click="beginGroupPlanConvert">
              Begin converting to group plan subscription
            </button>
          </div>
        </div>
        <div class="form-group row"
          v-if="isConvertingToGroupPlan">
          <label class="col-sm-3 col-form-label">
            Group Plan group ID:
          </label>
          <div class="col-sm-9">
            <input
              v-model="groupPlanID"
              class="form-control"
              type="text"
            >
          </div>
        </div>
      </div>
      <div
        v-if="expand"
        class="card-footer d-flex align-items-center justify-content-between"
      >
        <input
          type="submit"
          value="Save"
          class="btn btn-primary mt-1"
          @click="saveClicked"
        >
        <b v-if="hasUnsavedChanges" class="text-warning float-right">
          Unsaved changes
        </b>
      </div>
    </div>
    <b-modal id="sub_termination_modal" title="Set Termination Date">
      <p>
        You can set the sub benefit termination date to today or to the last
        day of the current billing cycle. Any extra subscription credit will
        then be processed and automatically added onto the selected date.
      </p>
      <template #modal-footer>
        <div class="mt-3 btn btn-secondary" @click="$bvModal.hide('sub_termination_modal')">
          Close
        </div>
        <div class="mt-3 btn btn-danger" @click="terminateSubscription()">
          Set to Today
        </div>
        <div class="mt-3 btn btn-danger" @click="terminateSubscription(todayWithRemainingCycle)">
          Set to {{ todayWithRemainingCycle.utc().format('MM/DD/YYYY') }}
        </div>
      </template>
    </b-modal>
  </form>
</template>

<style lang="scss" scoped>
  @import '~@/assets/scss/colors.scss';

.input-group-append {
  width: auto;

  .input-group-text {
    border-bottom-right-radius: 2px;
    border-top-right-radius: 2px;
    font-weight: 600;
    font-size: 0.8rem;
    color: $gray-200;
  }
}
</style>

<script>
import isUUID from 'validator/es/lib/isUUID';
import moment from 'moment';
import { getPlanContext } from '@/../../common/script/cron';
import saveHero from '../mixins/saveHero';
import subscriptionBlocks from '../../../../../common/script/content/subscriptionBlocks';
import LoadingSpinner from '@/components/ui/loadingSpinner';

export default {
  mixins: [saveHero],
  components: {
    LoadingSpinner,
  },
  props: {
    hero: {
      type: Object,
      required: true,
    },
    hasUnsavedChanges: {
      type: Boolean,
      required: true,
    },
    groupPlans: {
      type: Array,
      default: null,
    },
  },
  data () {
    return {
      expand: false,
      isConvertingToGroupPlan: false,
      groupPlanID: '',
      subscriptionBlocks,
    };
  },
  computed: {
    nextHourglassDate () {
      const currentPlanContext = getPlanContext(this.hero, new Date());

      if (!currentPlanContext.nextHourglassDate) return 'N/A';
      return currentPlanContext.nextHourglassDate.format('MMMM YYYY');
    },
    isRegularPlanId () {
      return this.subscriptionBlocks[this.hero.purchased.plan.planId] !== undefined;
    },
    isRegularPaymentMethod () {
      return [
        'groupPlan',
        'Group Plan',
        'Stripe',
        'Apple',
        'Google',
        'Amazon Payments',
        'PayPal',
        'Gift',
      ].includes(this.hero.purchased.plan.paymentMethod);
    },
    todayWithRemainingCycle () {
      const now = moment();
      const monthCount = subscriptionBlocks[this.hero.purchased.plan.planId].months;
      const terminationDate = moment(this.hero.purchased.plan.dateCurrentTypeCreated || new Date());
      while (terminationDate.isBefore(now)) {
        terminationDate.add(monthCount, 'months');
      }
      return terminationDate;
    },
  },
  methods: {
    dateFormat (date) {
      if (!date) {
        return '--';
      }
      return moment(date).format('YYYY/MM/DD');
    },
    terminateSubscription (terminationDate) {
      if (terminationDate) {
        this.hero.purchased.plan.dateTerminated = terminationDate.utc().format();
      } else {
        this.hero.purchased.plan.dateTerminated = moment(new Date()).utc().format();
      }
      this.applyExtraMonths();
      this.saveHero({ hero: this.hero, msg: 'Subscription Termination', reloadData: true });
    },
    applyExtraMonths () {
      if (this.hero.purchased.plan.extraMonths > 0 || this.hero.purchased.plan.extraMonths !== '0') {
        const date = moment(this.hero.purchased.plan.dateTerminated || new Date());
        const extraMonths = Math.max(this.hero.purchased.plan.extraMonths, 0);
        const extraDays = Math.ceil(30.5 * extraMonths);
        this.hero.purchased.plan.dateTerminated = date.add(extraDays, 'days').utc().format();
        this.hero.purchased.plan.extraMonths = 0;
      }
    },
    beginGroupPlanConvert () {
      this.isConvertingToGroupPlan = true;
      this.hero.purchased.plan.owner = '';
    },
    saveClicked (e) {
      e.preventDefault();
      if (this.isConvertingToGroupPlan) {
        if (!isUUID(this.groupPlanID)) {
          alert('Invalid group ID');
          return;
        }
        this.hero.purchased.plan.convertToGroupPlan = this.groupPlanID;
        this.saveHero({ hero: this.hero, msg: 'Group Plan Subscription', reloadData: true });
      } else {
        this.saveHero({ hero: this.hero, msg: 'Subscription Perks', reloadData: true });
      }
    },
    switchUser (id) {
      if (window.confirm('Switch to this user?')) {
        this.$emit('changeUserIdentifier', id);
      }
    },
  },
};
</script>
