import SensorNode from "./SensorNode";
import ConditionNode from "./ConditionNode";
import MathNode from "./MathNode";
import ActionNode from "./ActionNode";

export { SensorNode, ConditionNode, MathNode, ActionNode };

export const nodeTypes = {
  sensor: SensorNode,
  condition: ConditionNode,
  math: MathNode,
  action: ActionNode,
  // Backwards compatibility aliases
  sensorNode: SensorNode,
  conditionNode: ConditionNode,
  movingAverageNode: MathNode,
  processingNode: MathNode,
  mathNode: MathNode,
  alertNode: ActionNode
};

export default nodeTypes;
