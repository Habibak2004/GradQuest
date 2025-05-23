<template>
  <div>
    <div
      :id="itemId"
      class="item-wrapper"
      @click="click()"
    >
      <div
        class="item pet-slot transition"
        :class="{'item-empty': !isOwned(), 'highlight': highlightBorder}"
      >
        <slot
          name="itemBadge"
          :item="item"
        ></slot><span
          v-if="isHatchable() && !item.isSpecial()"
          class="item-content hatchAgain"
        ><Sprite
          class="egg"
          :image-name="eggClass"
        /><Sprite
          class="potion"
          :image-name="potionClass"
        />
        </span>
        <Sprite
        v-else
          class="item-content"
          :class="itemClass()"
          :image-name="imageName()"
        />
        <span
          v-if="isAllowedToFeed() && progress() > 0"
          class="pet-progress-background"
        ><div
          class="pet-progress-bar"
          :style="{width: 100 * progress()/50 + '%' }"
        ></div></span>
      </div><span
        v-if="label"
        class="item-label"
      >{{ label }}</span>
    </div><b-popover
      :target="itemId"
      :triggers="showPopover ? 'hover' : ''"
      :placement="popoverPosition"
    >
      <div
        v-if="item.isHatchable()"
        class="hatchablePopover"
      >
        <h4 class="popover-content-title">
          {{ item.name }}
        </h4><div
          class="popover-content-text"
          v-html="$t('haveHatchablePet', { potion: item.potionName, egg: item.eggName })"
        ></div><div class="potionEggGroup">
          <div class="potionEggBackground">
            <Sprite :image-name="potionClass" />
          </div><div class="potionEggBackground">
            <Sprite :image-name="eggClass" />
          </div>
        </div>
      </div><div v-else>
        <h4 class="popover-content-title">
          {{ item.name }}
        </h4>
      </div>
    </b-popover>
  </div>
</template>

<style lang="scss">
  .pet-progress-background {
    width: 62px;
    height: 4px;
    background-color: #e1e0e3;
    position: absolute;
    bottom: 4px;
    left: calc((100% - 62px) / 2);
  }

  .pet-progress-bar {
    height: 4px;
    background-color: #24cc8f;
  }

  .hatchAgain {
    display: inline-flex;
    align-items: center;

    width: 94px;
    height: 94px;

    .egg {
      position: absolute;
      left: 4px;
      top: 14px;
      z-index: 1;
      transform: scale(1.2);
    }

    .potion {
      position: absolute;
      right: 4px;
      top: 14px;
      transform: scale(1.2);
    }
  }

  .invert {
    filter: invert(100%);
  }
</style>

<script>
import moment from 'moment';
import { v4 as uuid } from 'uuid';
import { mapState } from '@/libs/store';
import foolPet from '@/mixins/foolPet';
import {
  isAllowedToFeed, isHatchable, isOwned, isSpecial,
} from '../../../libs/createAnimal';
import Sprite from '@/components/ui/sprite';

export default {
  components: {
    Sprite,
  },
  mixins: [foolPet],
  props: {
    item: {
      type: Object,
    },
    label: {
      type: String,
    },
    highlightBorder: {
      type: Boolean,
      default: false,
    },
    popoverPosition: {
      type: String,
      default: 'bottom',
    },
    showPopover: {
      type: Boolean,
      default: true,
    },
  },
  data () {
    return Object.freeze({
      itemId: uuid(),
    });
  },
  computed: {
    ...mapState({
      userItems: 'user.data.items',
      currentEventList: 'worldState.data.currentEventList',
    }),
    potionClass () {
      return `Pet_HatchingPotion_${this.item.potionKey}`;
    },
    eggClass () {
      return `Pet_Egg_${this.item.eggKey}`;
    },
  },
  methods: {
    click () {
      this.$emit('click', {});
    },
    isOwned () {
      return isOwned('pet', this.item, this.userItems);
    },
    isAllowedToFeed () {
      return isAllowedToFeed(this.item, this.userItems);
    },
    itemClass () {
      if (this.isOwned() || this.isHatchable()) {
        return '';
      }
      return 'GreyedOut';
    },
    imageName () {
      const foolEvent = this.currentEventList?.find(event => moment()
        .isBetween(event.start, event.end) && event.aprilFools);
      if (this.isOwned() && foolEvent) {
        if (this.isSpecial()) return `stable_${this.foolPet(this.item.key, foolEvent.aprilFools)}`;
        const petString = `${this.item.eggKey}-${this.item.key}`;
        return `stable_${this.foolPet(petString, foolEvent.aprilFools)}`;
      }

      if (this.isOwned() || (this.mountOwned() && this.isHatchable())) {
        return `stable_Pet-${this.item.key}`;
      }

      if (!this.isOwned() && this.isSpecial()) {
        return 'PixelPaw';
      }

      if (this.isHatchable()) {
        return 'PixelPaw';
      }

      if (this.mountOwned()) {
        return `stable_Pet-${this.item.key}`;
      }

      // Can't hatch
      return 'PixelPaw';
    },
    progress () {
      return this.userItems.pets[this.item.key];
    },
    // due to some state-refresh issues these methods are needed,
    // the computed-properties just didn't refresh on each state-change
    isHatchable () {
      return isHatchable(this.item, this.userItems);
    },
    mountOwned () {
      return isOwned('mount', this.item, this.userItems);
    },
    isSpecial () {
      return isSpecial(this.item);
    },
  },
};
</script>
